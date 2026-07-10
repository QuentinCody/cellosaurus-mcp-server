/**
 * Verify-citation tool factory — a shared MCP tool that re-checks the integrity
 * anchors of a previously-issued citation.
 *
 * A {@link Citation} (see `../provenance/provenance`) carries two anchors:
 *   - `result_hash = sha256(canonicalJson(result))` — WHAT came back
 *   - `query_hash  = sha256(canonicalJson(query))`  — WHAT was asked
 *     (for `<prefix>_execute` citations, `query` is the raw code STRING)
 *
 * This tool recomputes either/both from caller-supplied values and reports
 * whether they match — using the SAME canonicalization + sha256 that produced
 * the citation. Two protocols it enables:
 *
 *   1. Integrity: prove cited bytes were not altered
 *      → { expected_hash: citation.result_hash, data: <the claimed data> }
 *        (back-compatible: still returns flat { verified, expected_hash, actual_hash })
 *   2. REPLAY (adjudicating disagreements between agents/models): prove that
 *      a piece of code IS the cited query, then re-run it and compare.
 *      → { query_hash: citation.query_hash, query: "<exact code string>" }
 *        …if verified, re-execute that exact code via the server's
 *        `<prefix>_execute` tool and verify the fresh result with
 *        { expected_hash: citation.result_hash, data: <fresh result> }.
 *      Disagreements are settled by replay, never by plausibility.
 *
 * Registered under the single name `verify_citation`. Unlike the per-server
 * data tools, this is the SAME stateless tool on every server, so the repo's
 * `mcp_`-prefixed alias would add a redundant copy with no disambiguation value
 * (and, fleet-wide, doubles this tool's entry count in raw multi-server clients)
 * — so it is deliberately NOT dual-registered.
 */
import { z } from "zod";
/** The Zod input schema for the verify-citation tool. */
export interface VerifyCitationSchema {
    expected_hash: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodUnknown>;
    query_hash: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodUnknown>;
    baseline: z.ZodOptional<z.ZodUnknown>;
    citation: z.ZodOptional<z.ZodUnknown>;
    public_jwk: z.ZodOptional<z.ZodUnknown>;
}
export interface VerifyCitationToolResult {
    /** Primary registered tool name. */
    name: string;
    /** Human/agent-readable description. */
    description: string;
    /** Zod input schema (raw shape passed to `server.tool`). */
    schema: VerifyCitationSchema;
    /** Register the `verify_citation` tool on an MCP server. */
    register: (server: {
        tool: (...args: unknown[]) => void;
    }) => void;
}
/** Bounded structural diff of two JSON values — see {@link structuralDrift}. */
export interface DriftSummary {
    /** True when any leaf path was added, removed, or changed. */
    changed: boolean;
    /** Leaf paths present in `data` but not `baseline` (capped). */
    added: string[];
    /** Leaf paths present in `baseline` but not `data` (capped). */
    removed: string[];
    /** Leaf paths present in both whose canonical value differs (capped). */
    changed_paths: string[];
    /** True when any list was capped — the diff is partial, not the verdict. */
    truncated: boolean;
}
/**
 * Bounded, deterministic structural diff between a `baseline` and `data` JSON
 * value, over the SAME canonicalization used to hash citations. Turns a bare
 * hash mismatch into "what changed" — the drift-vs-tamper distinction. Paths
 * are advisory; the load-bearing verdict is always the hash comparison.
 */
export declare function structuralDrift(baseline: unknown, data: unknown): DriftSummary;
/**
 * Register `verify_citation` (+ its `mcp_` alias) on a server exactly once.
 *
 * This is the fleet-wide entry point: the REST / GraphQL / SPARQL execute
 * factories all call it, so any server exposing Code Mode can re-check the
 * `_meta.citation` anchors it emits. Emitting a `result_hash` a caller has no
 * way to verify is worse than emitting none — it invites trust it hasn't
 * earned.
 *
 * @returns true when this call performed the registration, false when the
 *   server already had the tool.
 */
export declare function registerVerifyCitationOnce(server: {
    tool: (...args: unknown[]) => void;
}): boolean;
/**
 * Create a registerable `verify_citation` tool.
 *
 * Input: any of `{ expected_hash + data }` (result integrity) and/or
 * `{ query_hash + query }` (query identity / replay). At least one pair.
 *
 * `register()` delegates to {@link registerVerifyCitationOnce}, so calling it
 * on a server the execute factory already covered is safe.
 */
export declare function createVerifyCitationTool(): VerifyCitationToolResult;
//# sourceMappingURL=verify-citation-tool.d.ts.map