/**
 * Empty-result guard — hardens the "silent empty" failure mode without adding
 * meaningful latency or new failure modes to the common legitimate-empty case.
 *
 * Upstream data APIs (CMS data API, DKAN, …) can return a well-formed EMPTY
 * response for a filtered query — sometimes because the filter genuinely has no
 * rows (a real "this provider prescribed no X"), sometimes because the dataset
 * UUID churned / was misrouted (a spurious empty that reads as "no data
 * exists"). An agent that can't tell these apart will confidently assert
 * absence. Observed live 2026-07-03: NPI-filtered CMS Part D queries returned
 * clean zero-row responses for a real provider.
 *
 * Design constraints learned from that incident:
 *   - The common case (a real, legitimately-empty filter) MUST stay cheap and
 *     MUST NOT start failing. These servers answer many "no records" queries.
 *   - A sub-second retry does NOT catch a minutes-long transient, so we don't
 *     pretend to — retry is opt-in and off by default in the hot path.
 *   - The one cheap, high-value signal is an UNFILTERED probe of the same
 *     dataset: if even that returns nothing, the dataset itself is empty /
 *     unreachable / misrouted, and the original empty must surface as an ERROR
 *     rather than a silent `[]`.
 *
 * Protocol (adapters invoke this ONLY when a filtered request came back empty):
 *   1. (optional) If a `refetch` is supplied, retry once; a recovered non-empty
 *      is returned and flagged transient. Adapters on slow upstreams omit this.
 *   2. Probe the SAME dataset UNFILTERED (cheap, limit 1), with a tight budget.
 *      - probe returns rows  → dataset is live; the empty is a certified
 *        negative FOR THIS FILTER (still cross-check by an alternate key).
 *      - probe returns empty → dataset itself is empty/dead → throw
 *        {@link EmptyDatasetError} so the caller sees an error, never `[]`.
 *      - probe errors/times out → INCONCLUSIVE: degrade gracefully to the
 *        original empty with no strong annotation (never worse than status quo).
 *
 * IMPORTANT: probe/refetch callbacks must hit the upstream directly (not recurse
 * through the guarded adapter path) and SHOULD use a short timeout + no retries
 * so the guard can never itself blow the isolate execution budget.
 */
/** Annotation attached to certified/recovered empty results. */
export interface EmptyGuardInfo {
    /**
     * True when a filtered query returned 0 rows AND an unfiltered probe
     * confirmed the dataset is live: a certified negative for THIS filter.
     * Still cross-check by an alternate key before asserting real-world absence.
     */
    verified_empty?: true;
    /**
     * True when the first response was empty but a retry returned rows — the
     * empty was a transient upstream artifact.
     */
    transient_empty_recovered?: true;
    /** Human/agent-readable explanation of what the guard did. */
    note: string;
    /** What was probed (dataset id / path), for diagnostics. */
    probed: string;
}
/** Result of running the guard: the data to return + optional annotation. */
export interface GuardOutcome<T> {
    data: T;
    guard?: EmptyGuardInfo;
}
export interface EmptyResultGuardOptions<T> {
    /** Is this payload an empty result? (Called on retry/probe payloads.) */
    isEmpty(data: T): boolean;
    /** Issue an UNFILTERED limit-1 request against the same dataset. Must not recurse. */
    probe(): Promise<T>;
    /**
     * Optional: re-issue the ORIGINAL request (same filters) once, to recover a
     * transient empty. Omit on slow upstreams — a sub-second retry rarely helps
     * and adds a round-trip. Must not recurse into the guard.
     */
    refetch?(): Promise<T>;
    /** Emptiness test for the probe payload; defaults to `isEmpty`. */
    isProbeEmpty?(data: T): boolean;
    /** Dataset/path label for messages, e.g. "CMS dataset <uuid> (/prescriber/search)". */
    describe?: string;
    /** Delay before the retry, in ms (default 0). Only used when `refetch` is set. */
    retryDelayMs?: number;
    /** Host-side logger (shows up in `wrangler tail`); optional. */
    log?: (message: string) => void;
}
/**
 * Thrown when the unfiltered probe positively returns nothing: the dataset is
 * empty, unreachable, or misrouted. Callers must surface this as an error — it
 * means "do NOT interpret the empty result as absence of data." A probe that
 * merely errors/times out does NOT raise this (that path degrades gracefully).
 */
export declare class EmptyDatasetError extends Error {
    readonly code = "EMPTY_DATASET_SUSPECTED";
    constructor(message: string);
}
/**
 * Run the empty-result verification protocol on a filtered response that came
 * back empty. See module docs for the full protocol.
 *
 * Adapters attach the returned `guard` where the payload shape allows:
 * object envelopes get `data.__guard = guard`; bare-array payloads are wrapped
 * as `{ __guard, data: [] }` (only ever done for EMPTY arrays, so `r.data || r`
 * consumer patterns keep working). A graceful-degrade outcome has no `guard`.
 */
export declare function guardEmptyResult<T>(first: T, options: EmptyResultGuardOptions<T>): Promise<GuardOutcome<T>>;
//# sourceMappingURL=empty-result-guard.d.ts.map