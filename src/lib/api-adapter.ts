import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { cellosaurusFetch } from "./http";

/**
 * Adapter from the Cellosaurus HTTP surface to the Code Mode `ApiFetchFn`.
 *
 * Cellosaurus is a flat REST/JSON service — no trailing-slash routing quirk
 * (unlike InterPro's DRF) and no version response header (the release version
 * is carried in the body of `/release-info`). Paths pass through as-is; the
 * isolate's `api.get()` already URL-encodes query params (needed for the Solr
 * `q=` search strings, which contain `:` and quotes).
 *
 * When the caller requests a non-JSON `format` (xml/txt/tsv) the upstream
 * returns text; we surface it under `{ text }` rather than attempting to parse.
 *
 * Future option: Cellosaurus also exposes a SPARQL endpoint / RDF dumps
 * (https://sparql.cellosaurus.org). This server intentionally covers only the
 * REST API; a SPARQL execute path would be a separate capability.
 */
export function createCellosaurusApiFetch(): ApiFetchFn {
    return async (request) => {
        const response = await cellosaurusFetch(request.path, request.params);

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: { text } };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
