import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const CELLOSAURUS_BASE = "https://api.cellosaurus.org";

export interface CellosaurusFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the SIB Cellosaurus API (https://api.cellosaurus.org).
 * No auth required for read operations.
 *
 * Cellosaurus content-negotiates on the `Accept` header: sending
 * `Accept: application/json` returns JSON even when no `format` query param is
 * supplied (verified live). Callers may still pass `format=xml|txt|tsv` to
 * override — the adapter returns those as `{ text }`.
 */
export async function cellosaurusFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: CellosaurusFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? CELLOSAURUS_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "cellosaurus-mcp-server/1.0 (bio-mcp)",
    });
}
