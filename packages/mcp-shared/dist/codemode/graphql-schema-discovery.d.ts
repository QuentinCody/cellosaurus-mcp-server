/**
 * GraphQL schema-discovery runtime for Code Mode — the `<prefix>_search` tool
 * plus the shared "introspection unavailable" fallback.
 *
 * Split out of graphql-execute-tool.ts (line cap) and the home for graceful
 * degradation: some GraphQL APIs disable introspection in production (e.g. NCI
 * PDC's Apollo server sets `introspection: false`). Without this, the very first
 * thing every `_execute`/`_search` call does — fetch the schema — throws, and the
 * tool is 100% unusable even though `gql.query()` against the real API works fine.
 * Here we treat an introspection failure as "schema discovery unavailable" and let
 * direct queries proceed.
 */
import type { ApiCatalog } from "./catalog";
import { type GraphqlFetchFn, type TrimmedIntrospection } from "./graphql-introspection";
/**
 * Message surfaced (as `schema.note` inside the isolate and as the `_search`
 * tool's text) when an upstream disables GraphQL introspection. Kept generic so
 * it reads correctly for any such API, not just PDC.
 */
export declare const SCHEMA_DISCOVERY_UNAVAILABLE: string;
/**
 * Empty schema injected into the isolate when introspection is unavailable, so
 * the `schema.*` helpers exist (returning empty) instead of the isolate throwing.
 */
export declare const EMPTY_SCHEMA: TrimmedIntrospection;
/** The slice of the execute tool's introspection cache these helpers read/write. */
export interface IntrospectionCache {
    introspection: TrimmedIntrospection | undefined;
    /** Set once when introspection is disabled upstream so we don't re-fetch. */
    introspectionUnavailable?: boolean;
}
/**
 * Fetch introspection once, into the shared cache. If the upstream disables it,
 * cache the failure (so we don't retry every call) and leave `introspection`
 * undefined — callers treat that as "unavailable" (pre-flight skipped in the
 * proxy, `schema.*` helpers empty). A transient failure is also cached; Workers
 * are ephemeral, so a later cold start re-attempts, and `gql.query()` works
 * either way.
 */
export declare function ensureIntrospectionCached(cache: IntrospectionCache, gqlFetch: GraphqlFetchFn): Promise<void>;
/**
 * Register the `<prefix>_search` schema-discovery tool (#3). Shares the execute
 * tool's lazy introspection cache (no second introspection fetch), letting a model
 * find REAL query roots / fields before writing a `_execute` query — closing the
 * prior gap where guessed GraphQL fields produced invalid-query / empty results.
 * When the API disables introspection, returns a clear "unavailable" note instead
 * of erroring, pointing the caller at `<prefix>_execute` (which still works).
 */
export declare function registerGraphqlSearchTool(server: {
    tool: (...args: unknown[]) => void;
}, opts: {
    prefix: string;
    apiName: string;
    gqlFetch: GraphqlFetchFn;
    cache: IntrospectionCache;
    /** Optional static catalog. When introspection is unavailable upstream,
     *  `_search` searches this instead of returning the dead-end note. */
    catalog?: ApiCatalog;
}): void;
//# sourceMappingURL=graphql-schema-discovery.d.ts.map