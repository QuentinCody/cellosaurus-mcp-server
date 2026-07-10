import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

/**
 * Staging DO for Cellosaurus cell-line records.
 *
 * Every Cellosaurus response is wrapped in a `{ Cellosaurus: { ... } }` envelope.
 * A single-line fetch or a search returns `cell-line-list` (an array of records);
 * a full single-line fetch ALSO carries a sibling `publication-list`. Each record
 * is itself deeply nested (comment-list, xref-list, reference-list,
 * sequence-variation-list, str-list, ...), so a well-annotated line — e.g. HeLa
 * (CVCL_0030) ≈ 450 KB or Caco-2 (CVCL_0025) ≈ 130 KB (compact JSON, verified
 * live) — far exceeds the 30 KB inline threshold and auto-stages; the
 * consolidated engine extracts those child arrays into their own SQLite tables
 * joined by parent_id.
 *
 * We only force a `cell_lines` table name when `cell-line-list` is the SOLE
 * tabular array. When a `publication-list` is co-present, a fixed table name
 * would make the staging engine's de-dupe (`if (seenNames.has(tableName))
 * continue`) silently drop the second array — so in that case we return no hint
 * and let each array keep its own key-derived table name (never lose data).
 *
 * Index hints are restricted to columns actually present in the sampled row:
 * callers can trim any field via `fields=`/`fld=`, and the engine emits
 * `CREATE INDEX` for hint columns unconditionally (an index on a missing column
 * would abort the staging transaction).
 */
export class CellosaurusDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;

        // Unwrap the `{ Cellosaurus: { ... } }` envelope when present.
        const outer = data as Record<string, unknown>;
        const inner = outer.Cellosaurus;
        const root =
            inner && typeof inner === "object" && !Array.isArray(inner)
                ? (inner as Record<string, unknown>)
                : outer;

        const cellLines = root["cell-line-list"];
        const publications = root["publication-list"];
        const hasPublications = Array.isArray(publications) && publications.length > 0;

        if (Array.isArray(cellLines) && cellLines.length > 0 && !hasPublications) {
            const sample = cellLines[0];
            if (sample && typeof sample === "object" && !Array.isArray(sample)) {
                const keys = new Set(Object.keys(sample as Record<string, unknown>));
                const indexes = ["category", "sex", "age"].filter((c) => keys.has(c));
                return indexes.length > 0
                    ? { tableName: "cell_lines", indexes }
                    : { tableName: "cell_lines" };
            }
            return { tableName: "cell_lines" };
        }

        return undefined;
    }
}
