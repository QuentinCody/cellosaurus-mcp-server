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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { ErrorResponse, ResponseMeta, SuccessResponse } from "../codemode/response";
import { type SourceDescriptor } from "../provenance/provenance";
/** A single text content block — the fleet's human/agent-readable summary. */
export interface ToolContent {
    type: "text";
    text: string;
}
/**
 * The context object every tool handler receives as its second argument,
 * identical to what `server.registerTool`'s callback is handed (session id,
 * request metadata, abort signal, …). On Cloudflare McpAgent it additionally
 * carries `env`; read it with a cast (`(extra as { env?: Env }).env`).
 */
export type ToolHandlerExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;
/**
 * Success branch of a tool's return. REQUIRES `content` + `structuredContent`.
 * `isError` is optionally `false` so this stays distinct from {@link ToolErr}.
 */
export interface ToolOk<Data = unknown> {
    content: ToolContent[];
    structuredContent: SuccessResponse<Data>;
    isError?: false;
}
/**
 * Error branch of a tool's return. REQUIRES `content` + `structuredContent` +
 * `isError: true`. Because the inner body is `{ success: false, ... }`, an
 * error object can never masquerade as a {@link ToolOk} — forgetting
 * `isError: true` is *also* a compile error.
 */
export interface ToolErr {
    content: ToolContent[];
    structuredContent: ErrorResponse;
    isError: true;
}
/**
 * The discriminated union a `defineTool` handler must return. Neither branch
 * lets you omit `structuredContent`; the error branch pins `isError: true`.
 * This is the compile-time gate — the whole point of the factory.
 */
export type ToolResult<Data = unknown> = ToolOk<Data> | ToolErr;
/** Infer the parsed argument object from a raw Zod shape. */
type InferShape<Shape extends z.ZodRawShape> = z.infer<z.ZodObject<Shape>>;
/** The typed handler a caller supplies to {@link defineTool}. */
export type ToolHandler<Shape extends z.ZodRawShape, Data> = (args: InferShape<Shape>, extra: ToolHandlerExtra) => ToolResult<Data> | Promise<ToolResult<Data>>;
/** Configuration for {@link defineTool}. */
export interface DefineToolConfig<Shape extends z.ZodRawShape, Data = unknown> {
    /**
     * Canonical `<server>_<tool>` tool name (e.g. `"gnomad_gene_constraint"`).
     * The factory also registers the `mcp_`-prefixed alias automatically.
     */
    name: string;
    /** Human/agent-facing description shown in `tools/list`. */
    description: string;
    /** Optional display title. */
    title?: string;
    /** Raw Zod shape for the tool's arguments — drives typed `args`. */
    inputSchema: Shape;
    /**
     * Upstream source descriptor. When present, every SUCCESSFUL result gets a
     * verifiable `_meta.citation` (source + query/result hashes + timestamp).
     */
    source?: SourceDescriptor;
    /** Optional MCP tool annotations. */
    annotations?: Record<string, unknown>;
    /** The typed handler. Its return type enforces the tool contract. */
    handler: ToolHandler<Shape, Data>;
}
/** Options for {@link toolOk}. */
export interface ToolOkOptions {
    /** Override the text-content summary (default: truncated JSON preview). */
    text?: string;
    /** `_meta` to attach (citation is added automatically when a source is set). */
    meta?: ResponseMeta;
    /** Max characters for the auto-generated JSON preview (default 300). */
    maxPreviewChars?: number;
}
/** Options for {@link toolErr}. */
export interface ToolErrOptions {
    /** Override the text-content summary (default: `Error: <message>`). */
    text?: string;
    /** Structured error details. */
    details?: unknown;
}
/**
 * Build a contract-valid SUCCESS result. Guarantees `content` +
 * `structuredContent: { success: true, data, _meta? }`.
 */
export declare function toolOk<Data>(data: Data, options?: ToolOkOptions): ToolOk<Data>;
/**
 * Build a contract-valid ERROR result. Guarantees `content` +
 * `structuredContent: { success: false, error }` + `isError: true`.
 */
export declare function toolErr(code: string, message: string, options?: ToolErrOptions): ToolErr;
/**
 * Register a hand-built MCP tool with the full fleet contract enforced by the
 * type system and applied automatically. See the module header for details.
 *
 * @param server the `McpServer` to register on
 * @param config typed tool definition — `handler`'s return type is the gate
 */
export declare function defineTool<Shape extends z.ZodRawShape, Data = unknown>(server: McpServer, config: DefineToolConfig<Shape, Data>): void;
export {};
//# sourceMappingURL=define-tool.d.ts.map