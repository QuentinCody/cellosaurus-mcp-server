/**
 * `defineTool()` — the typed, contract-safe way to register a hand-built MCP tool.
 *
 * Track E of the agent-readiness plan: move the fleet's 7 semantic tool
 * invariants from prose (CLAUDE.md "Key Patterns & Conventions") into the type
 * system so they become *impossible to violate at compile time* instead of
 * runtime surprises a reviewer has to catch.
 *
 * A single call:
 *   defineTool(server, { name, description, inputSchema, source?, handler })
 *
 * enforces / applies, automatically:
 *   1. **Both fields, both branches.** The handler's return type is a
 *      discriminated union ({@link ToolResult}) whose success branch REQUIRES
 *      `content` + `structuredContent`, and whose error branch REQUIRES
 *      `content` + `structuredContent` + `isError: true`. Omitting
 *      `structuredContent` (or `isError` on the error path) is a `tsc` error —
 *      not a silent 500.
 *   2. **Dual registration.** Registers under BOTH `mcp_<server>_<tool>` and
 *      `<server>_<tool>` from the single `name` you pass.
 *   3. **100KB transport guard.** MCP Streamable-HTTP silently drops responses
 *      over 100KB; the wrapper size-checks `structuredContent` and drops the
 *      heavy `data` payload (keeping `_meta` + citation) before it can be lost.
 *   4. **Verifiable provenance.** When a `source` descriptor is given, every
 *      successful result carries a `_meta.citation` (source + query/result
 *      hashes + timestamp) via the shared provenance helper.
 *
 * The `structuredContent` shape mirrors the fleet's existing Code Mode envelope
 * (`{ success, data, _meta }` / `{ success:false, error }`) so results are a
 * drop-in for the cf/ chat's Sources panel and every existing consumer.
 *
 * This module is additive: it does not change any server. Servers opt in by
 * importing `{ defineTool }` from `@bio-mcp/shared`.
 */
import { buildCitation } from "../provenance/provenance";
/** MCP Streamable-HTTP silently drops responses larger than this. */
const MAX_STRUCTURED_CONTENT_BYTES = 100_000;
function previewJson(value, maxChars) {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined)
        return "undefined";
    return json.length <= maxChars
        ? json
        : `${json.slice(0, maxChars)}\n... [truncated for display]`;
}
/**
 * Build a contract-valid SUCCESS result. Guarantees `content` +
 * `structuredContent: { success: true, data, _meta? }`.
 */
export function toolOk(data, options = {}) {
    const { text, meta, maxPreviewChars = 300 } = options;
    const structuredContent = {
        success: true,
        data,
        ...(meta && Object.keys(meta).length > 0 ? { _meta: meta } : {}),
    };
    return {
        content: [
            { type: "text", text: text ?? previewJson(structuredContent, maxPreviewChars) },
        ],
        structuredContent,
    };
}
/**
 * Build a contract-valid ERROR result. Guarantees `content` +
 * `structuredContent: { success: false, error }` + `isError: true`.
 */
export function toolErr(code, message, options = {}) {
    const structuredContent = {
        success: false,
        error: {
            code,
            message,
            ...(options.details !== undefined ? { details: options.details } : {}),
        },
    };
    return {
        content: [{ type: "text", text: options.text ?? `Error: ${message}` }],
        structuredContent,
        isError: true,
    };
}
function resolveRecordCount(data, meta) {
    if (Array.isArray(data))
        return data.length;
    if (meta && typeof meta.row_count === "number")
        return meta.row_count;
    return undefined;
}
function resolveDataAccessId(data, meta) {
    if (meta && typeof meta.data_access_id === "string")
        return meta.data_access_id;
    if (data &&
        typeof data === "object" &&
        typeof data.data_access_id === "string") {
        return data.data_access_id;
    }
    return undefined;
}
/**
 * Register a hand-built MCP tool with the full fleet contract enforced by the
 * type system and applied automatically. See the module header for details.
 *
 * @param server the `McpServer` to register on
 * @param config typed tool definition — `handler`'s return type is the gate
 */
export function defineTool(server, config) {
    // Derive both registration names from the single canonical name.
    const bare = config.name.startsWith("mcp_")
        ? config.name.slice("mcp_".length)
        : config.name;
    const prefixed = `mcp_${bare}`;
    const wrapped = async (args, extra) => {
        let result;
        try {
            result = await config.handler(args, extra);
        }
        catch (err) {
            // Safety net: a thrown handler still yields a contract-valid error.
            const message = err instanceof Error ? err.message : String(err);
            result = toolErr("UNHANDLED_ERROR", `${bare} failed: ${message}`);
        }
        const isError = result.isError === true;
        const structured = { ...result.structuredContent };
        // (4) Verifiable provenance — success results only, when a source is set.
        if (!isError && config.source && structured.success === true) {
            const data = structured.data;
            const meta = structured._meta;
            const citation = await buildCitation({
                source: config.source,
                server: config.source.id,
                tool: bare,
                query: args,
                result: data,
                retrievedAt: new Date().toISOString(),
                recordCount: resolveRecordCount(data, meta),
                dataAccessId: resolveDataAccessId(data, meta),
            });
            structured._meta = { ...(meta ?? {}), citation };
        }
        // (3) 100KB Streamable-HTTP transport guard.
        if (JSON.stringify(structured).length > MAX_STRUCTURED_CONTENT_BYTES) {
            if (structured.success === true) {
                const meta = structured._meta ?? {};
                structured.data = undefined;
                structured._meta = {
                    ...meta,
                    truncated: true,
                    truncated_reason: "structuredContent exceeded the 100KB MCP Streamable-HTTP limit; `data` omitted to avoid a silent drop. Stage/query the dataset or narrow the request. The citation's result_hash still attests the full result.",
                };
            }
            else if (structured.error && typeof structured.error === "object") {
                structured.error = {
                    ...structured.error,
                    details: undefined,
                };
            }
        }
        return {
            content: result.content,
            structuredContent: structured,
            ...(isError ? { isError: true } : {}),
        };
    };
    // (2) Dual registration — bind() preserves `this`; the loose cast is the
    // single, localized SDK-boundary escape hatch.
    const register = server.registerTool.bind(server);
    const toolConfig = {
        title: config.title,
        description: config.description,
        inputSchema: config.inputSchema,
        ...(config.annotations ? { annotations: config.annotations } : {}),
    };
    register(prefixed, toolConfig, wrapped);
    register(bare, toolConfig, wrapped);
}
//# sourceMappingURL=define-tool.js.map