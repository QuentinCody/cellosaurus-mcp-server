import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";
import { buildCitation, mergeCompleteness, type Completeness } from "@bio-mcp/shared";
import { searchCompleteness } from "./api-adapter";
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

type Result = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean; [key: string]: unknown };
type DataEnv = { CELLOSAURUS_DATA_DO?: unknown };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const source = { id: "cellosaurus", name: "Cellosaurus", url: "https://www.cellosaurus.org" };

function sourceCompleteness(structured: Record<string, unknown>, toolName: string): Completeness | undefined {
  if (!toolName.endsWith("cellosaurus_execute")) return undefined;
  const meta = isRecord(structured._meta) ? structured._meta : {};
  if (isRecord(meta.completeness) && typeof meta.completeness.complete === "boolean") return meta.completeness as unknown as Completeness;
  const data = structured.data;
  const context = isRecord(data) ? data._cellosaurus : undefined;
  if (isRecord(context) && context.kind === "search_page") return searchCompleteness(typeof context.returned === "number" ? context.returned : undefined);
  return undefined;
}

async function citeUncitedResult(structured: Record<string, unknown>, toolName: string, query: unknown) {
  const meta = isRecord(structured._meta) ? structured._meta : {};
  if (isRecord(meta.citation)) return structured;
  const { _meta: _metadata, ...root } = structured;
  // The shared factory now signs the exact caller code. Supply a citation only
  // for uncited validation/program errors; never rewrite a signed citation.
  const code = toolName.endsWith("cellosaurus_execute") && isRecord(query) && typeof query.code === "string" ? query.code : undefined;
  const citation = await buildCitation({ source, server: "cellosaurus", tool: toolName.replace(/^mcp_/, ""), query: code ?? query,
    queryScope: code === undefined ? "tool_arguments" : "tool_argument:code", result: root, resultScope: "structured_content:root_without_meta",
    retrievedAt: new Date().toISOString() });
  return { ...structured, _meta: { ...meta, citation } };
}

/** Apply the transport limit to the complete tool envelope, including escaped text. */
export async function cellosaurusResponse(work: () => Promise<Result>, env: DataEnv, toolName: string, extra: unknown, query: unknown = {}): Promise<Result> {
  try {
    const original = await work();
    let structured = original.structuredContent ?? { success: original.isError !== true };
    const completeness = sourceCompleteness(structured, toolName);
    if (completeness) structured = { ...structured, _meta: { ...(isRecord(structured._meta) ? structured._meta : {}), completeness } };
    const apiError = structured.data && typeof structured.data === "object" && "__api_error" in structured.data && structured.data.__api_error === true;
    const failed = original.isError === true || structured.success === false || apiError || Boolean(structured.program_error) || structured.disposition === "partial";
    const cited = await citeUncitedResult(failed ? { ...structured, success: false } : structured, toolName, query);
    const result = { ...original, structuredContent: cited, ...(failed ? { isError: true } : {}) };
    if (!shouldStage(bytes(result))) return result;
    return await stageResponse(env, result, toolName, extra, query, completeness, failed);
  } catch {
    const data = { success: false, error: { code: "RESPONSE_ERROR", message: "Cellosaurus response could not be returned." } };
    const citation = await buildCitation({ source, server: "cellosaurus", tool: toolName.replace(/^mcp_/, ""),
      query, queryScope: "tool_arguments", retrievedAt: new Date().toISOString(), result: data, resultScope: "structured_content:root_without_meta" });
    return { content: [{ type: "text", text: data.error.message }], structuredContent: { ...data, _meta: { citation } }, isError: true };
  }
}

async function stageResponse(env: DataEnv, result: Result, toolName: string, extra: unknown, query: unknown, completeness: Completeness | undefined, failed: unknown) : Promise<Result> {
  if (!env.CELLOSAURUS_DATA_DO) throw new Error("Missing staging storage");
  const staged = await stageToDoAndRespond(result, env.CELLOSAURUS_DATA_DO as Parameters<typeof stageToDoAndRespond>[1], "cellosaurus", undefined,
    { toolName, serverName: "cellosaurus" }, "cellosaurus", extra as Parameters<typeof stageToDoAndRespond>[6]);
  const citation = await buildCitation({
    source, server: "cellosaurus", tool: toolName.replace(/^mcp_/, ""),
    query, queryScope: "tool_arguments", retrievedAt: new Date().toISOString(), result, resultScope: "staged:full_result", dataAccessId: staged.dataAccessId
  });
  const combined = mergeCompleteness(completeness, staged._staging.completeness);
  const structuredContent = {
    success: !failed, staged: true, data: undefined, data_access_id: staged.dataAccessId,
    _staging: { ...staged._staging, ...(combined ? { completeness: combined } : {}) },
    _meta: { citation, ...(combined ? { completeness: combined } : {}) }
  };
  if (bytes(structuredContent) > 100000) throw new Error("Staging metadata exceeds transport limit");
  return { content: [{ type: "text", text: "Response staged. Use cellosaurus_query_data; payloads retains the complete original response." }], structuredContent, ...(failed ? { isError: true } : {}) };
}
