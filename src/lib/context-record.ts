import {cellosaurusFetch, fail} from "./http";

/** Native lookup does not resolve every secondary accession. Search only on 404. */
export async function fetchContextRecord(ac: string, fields: string, signal: AbortSignal) {
  try {
    return {response: await cellosaurusFetch(`/cell-line/${ac}`, {fields, format: "json"}, signal),
      resolution: "accession_lookup"};
  } catch (error) {
    if (!(error instanceof Error) || !("status" in error) || error.status !== 404) throw error;
  }
  const response = await cellosaurusFetch("/search/cell-line", {q: `acas:${ac}`, fields, format: "json", start: 0, rows: 2}, signal);
  const data = response.data as {Cellosaurus?: {"cell-line-list"?: unknown[]}};
  if (Array.isArray(data.Cellosaurus?.["cell-line-list"]) && data.Cellosaurus["cell-line-list"].length === 0) fail("Cellosaurus accession not found", 404);
  // The context validator requires exactly one record and an exact accession-list match.
  return {response, resolution: "exact_acas_search_after_lookup_404"};
}
