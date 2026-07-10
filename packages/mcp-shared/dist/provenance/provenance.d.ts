/**
 * Provenance / citation primitives — shared across all MCP servers.
 *
 * Lets every tool result carry a verifiable citation: which upstream SOURCE it
 * came from, WHAT was asked (query hash), and a content hash of the result that
 * any consumer can recompute to confirm the cited bytes were not altered. A
 * connected agent can then attribute every claim to a re-verifiable source.
 *
 * This is the canonical home for canonicalJson/sha256Hex in `@bio-mcp/shared`
 * (the clinical-orchestrator's private copy in src/lib/audit-chain.ts should be
 * migrated onto these).
 */
/**
 * Canonicalize a JSON value so structurally-equivalent inputs produce an
 * identical string (and therefore an identical sha256): object keys sorted,
 * `undefined` dropped, array order preserved.
 */
export declare function canonicalJson(value: unknown): string;
/** SHA-256 of a UTF-8 string, hex-encoded. */
export declare function sha256Hex(input: string): Promise<string>;
/** Canonical identity of an upstream data source, declared per server. */
export interface SourceDescriptor {
    /** Stable id / server alias, e.g. "opentargets". */
    id: string;
    /** Human-readable source name, e.g. "Open Targets". */
    name: string;
    /** Canonical homepage / data-portal URL. */
    url?: string;
    /** Data license, e.g. "CC0 1.0". */
    license?: string;
    /** Dataset or API version, if known. */
    version?: string;
}
/**
 * An Ed25519 attestation over a citation's integrity-critical fields (L2).
 * See `./signing`. A `result_hash` alone proves "these bytes hash to H"; a
 * signature proves the ISSUING SERVER vouches for { query_hash, result_hash,
 * time } and can be checked OFFLINE against the server's published JWKS.
 */
export interface CitationSignature {
    /** Signature algorithm (Ed25519). */
    alg: "Ed25519";
    /** Key id — matches the `kid` in the server's published JWKS. */
    key_id: string;
    /** ISO-8601 time the signature was produced (part of the signed payload). */
    signed_at: string;
    /** base64url(Ed25519 signature) over the canonical signing input. */
    sig: string;
}
/** A verifiable, re-checkable attribution for a single tool result. */
export interface Citation {
    source: SourceDescriptor;
    /** MCP server alias that served the result. */
    server: string;
    /** Tool invoked. */
    tool: string;
    /** ISO-8601 retrieval time. */
    retrieved_at: string;
    /** sha256(canonicalJson(query)) — what was asked. */
    query_hash: string;
    /** sha256(canonicalJson(result)) — integrity anchor for the cited bytes. */
    result_hash: string;
    /** Rows/records returned, when countable. */
    record_count?: number;
    /** Staged-data handle, when the result was staged. */
    data_access_id?: string;
    /**
     * True when this citation attests an EMPTY result (an absence claim).
     * Absence claims are epistemically weaker than data claims: check
     * `verification` for whether the emptiness was probe-certified.
     */
    negative_result?: boolean;
    /**
     * How the negative was verified: "probe-certified-empty" (the empty-result
     * guard retried the query and confirmed the dataset live via an unfiltered
     * probe) or "unverified-empty" (a plain zero-row result — treat as
     * UNCONFIRMED absence; re-verify via an alternate key before relying on it).
     */
    verification?: string;
    /**
     * Optional Ed25519 attestation (L2). Present only when the issuing server
     * has signing enabled. Absent = reproducible (L0) but NOT attested — do not
     * describe an unsigned citation as "tamper-evident". See `./signing`.
     */
    signature?: CitationSignature;
    /** Pre-formatted, agent/human-readable citation line. */
    text: string;
}
export interface BuildCitationInput {
    source: SourceDescriptor;
    server: string;
    tool: string;
    /** The request (args / code / query) — hashed into query_hash. */
    query: unknown;
    /** The result data being cited — hashed into result_hash. */
    result: unknown;
    /** ISO-8601 timestamp; caller supplies it (DO/Worker runtime: new Date().toISOString()). */
    retrievedAt: string;
    recordCount?: number;
    dataAccessId?: string;
}
/** Build a verifiable citation for a tool result. */
export declare function buildCitation(input: BuildCitationInput): Promise<Citation>;
/** Outcome of recomputing a result hash and comparing it to a cited one. */
export interface VerifyResult {
    /** True when the freshly-computed hash equals the expected hash. */
    verified: boolean;
    /** The hash that was previously issued / asserted. */
    expected_hash: string;
    /** sha256(canonicalJson(freshResult)) — recomputed from the supplied data. */
    actual_hash: string;
}
/**
 * Recompute the content hash of `freshResult` and confirm it matches a
 * previously-issued `result_hash`. Uses the SAME canonicalization + sha256 as
 * {@link buildCitation}, so a citation's `result_hash` can be re-verified by any
 * consumer holding the (claimed) underlying data.
 */
export declare function verifyResultHash(expectedHash: string, freshResult: unknown): Promise<VerifyResult>;
/**
 * Verify that `freshResult` reproduces the integrity anchor of a previously
 * issued {@link Citation}. Returns the same shape as {@link verifyResultHash}.
 */
export declare function verifyCitation(citation: Citation, freshResult: unknown): Promise<VerifyResult>;
//# sourceMappingURL=provenance.d.ts.map