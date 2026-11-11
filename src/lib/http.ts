export const CELLOSAURUS_BASE = "https://api.cellosaurus.org";
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), {status});
}

/** Fixed public read surface, with a deadline covering headers AND body. */
export async function cellosaurusFetch(
  path: string, params: Record<string, unknown> = {}, signal = AbortSignal.timeout(30_000),
): Promise<{status: number; data: unknown; url: string; sha256: string}> {
  if (!/^\/cell-line\/CVCL_[A-Z0-9]{4}$/.test(path) && !["/search/cell-line", "/release-info"].includes(path)) fail("Unsupported Cellosaurus path");
  const url = new URL(path, CELLOSAURUS_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    if (values.length > 64) fail("Too many Cellosaurus query values");
    for (const item of values) {
      if (!["string", "number", "boolean"].includes(typeof item) || String(item).length > 4000) fail("Invalid Cellosaurus query value");
      url.searchParams.append(key, String(item));
    }
  }
  if (url.href.length > 16000) fail("Cellosaurus query exceeds URL limit");
  const {response, bytes} = await readResponse(url, signal);
  let text: string;
  try { text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: false}).decode(bytes); }
  catch { fail("Invalid Cellosaurus UTF-8", 502); }
  let data: unknown;
  if (["xml", "txt", "tsv"].includes(String(params.format))) data = {text};
  else {
    if (!response.headers.get("content-type")?.includes("json")) fail("Expected Cellosaurus JSON", 502);
    try { data = JSON.parse(text); } catch { fail("Invalid Cellosaurus JSON", 502); }
    if (!data || typeof data !== "object" || Array.isArray(data) || !("Cellosaurus" in data)) fail("Missing Cellosaurus envelope", 502);
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return {status: response.status, data, url: url.href, sha256};
}

async function readBody(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 4 * 1024 * 1024) fail("Cellosaurus response exceeds 4 MiB", 502);
    parts.push(chunk.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

async function readResponse(url: URL, signal: AbortSignal) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  let abort = () => {};
  const deadline = new Promise<never>((_, reject) => {
    abort = () => reject(Object.assign(new Error("Cellosaurus request timed out"), {status: 502}));
    signal.addEventListener("abort", abort, {once: true});
    if (signal.aborted) abort();
  });
  const read = async () => {
    if (signal.aborted) fail("Cellosaurus request timed out", 502);
    response = await fetch(url, {headers: {Accept: "application/json"}, redirect: "manual", signal});
    if (!response.ok) fail(`Cellosaurus HTTP ${response.status}`, response.status);
    reader = response.body?.getReader(); if (!reader) fail("Empty Cellosaurus response", 502);
    return {response, bytes: await readBody(reader)};
  };
  try { return await Promise.race([read(), deadline]); }
  catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    fail("Cellosaurus request failed or response unreadable", 502);
  } finally {
    signal.removeEventListener("abort", abort);
    // Cancellation is best-effort; a stalled cancel must not hold the deadline open.
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    else if (response?.body) void response.body.cancel().catch(() => {});
  }
}
