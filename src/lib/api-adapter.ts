import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { cellosaurusFetch, fail } from "./http";
import { cellLineContext } from "./context";
import type { Completeness } from "@bio-mcp/shared";

export function searchCompleteness(returned?: number): Completeness {
  return { complete: false, ...(returned === undefined ? {} : {returned}),
    truncation: {reason: "page_limit", detail: "One Cellosaurus search page; the native response provides no total or snapshot cursor.",
      remedy: "Use start/rows for bounded continuation; retain each page and its source evidence."} };
}

function searchRequest(params: Record<string, unknown>) {
  if (Object.keys(params).some(key => !["q", "start", "rows", "sort", "format", "fields", "fld"].includes(key))) fail("Unsupported Cellosaurus search parameter");
  const output = {...params};
  for (const [key, fallback] of [["start", 0], ["rows", 1000]] as const) {
    const value = params[key] ?? fallback;
    if (!["string", "number"].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(`Invalid search ${key}`);
    output[key] = Number(value);
  }
  if (!Number.isSafeInteger(Number(output.start) + Number(output.rows))) fail("Cellosaurus search window exceeds safe integer range");
  return output;
}

export function createCellosaurusApiFetch(): ApiFetchFn {
  return async (request) => {
    if (request.method !== "GET" || request.body !== undefined) fail("Cellosaurus supports GET without a body");
    const params = request.path === "/search/cell-line" ? searchRequest(request.params ?? {}) : request.params ?? {};
    const context = /^\/cell-line\/(CVCL_[A-Z0-9]{4})\/context$/.exec(request.path);
    if (context) return cellLineContext(context[1], params);
    const result = await cellosaurusFetch(request.path, params);
    if (request.path === "/search/cell-line") {
      const data = result.data as {Cellosaurus?: {"cell-line-list"?: unknown[]}; text?: string};
      const records = data.Cellosaurus?.["cell-line-list"];
      if (data.text === undefined && !Array.isArray(records)) fail("Invalid Cellosaurus search records", 502);
      const returned = records?.length;
      const next = returned !== undefined && returned > 0 && returned === Number(params.rows) ? Number(params.start) + returned : null;
      return {status: result.status, completeness: searchCompleteness(returned), data: {...data, _cellosaurus: {
        kind: "search_page", request: params, returned: returned ?? null, complete: false,
        total_available: null, next_start_candidate: next, snapshot_is_atomic: false,
        source_url: result.url, source_sha256: result.sha256,
      }}};
    }
    return {status: result.status, data: result.data};
  };
}
