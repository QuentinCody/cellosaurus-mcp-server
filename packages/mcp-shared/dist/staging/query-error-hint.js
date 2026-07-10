// Self-describing staged-query errors (the fleet-wide twin of cf's
// workspace-tools.enrichQueryError).
//
// When a model's SQL hits "no such column/table" against a staged dataset, we
// append the REAL table + column names so it self-corrects in ONE step instead
// of guessing again or reaching for PRAGMA/sqlite_master. The error teaches the
// fix. Applied in query-handlers.ts so every staging server (~110) inherits it
// on its `*_query_data` tool. Also reframes Cloudflare DO SQLite's compound-
// SELECT cap (~10 UNION/INTERSECT/EXCEPT terms, far below standard SQLite's
// ~500), which a model-authored mega-UNION across staged tables can hit.
/** Normalize a `tables` value — which may be an object keyed by table name
 *  (per-server get_schema: `{tables:{name:{columns:[…]}}}`) or an array of
 *  `{name, columns}` (workspace datasets) — into `[name, columns]` pairs. */
function tableEntries(tables) {
    const out = [];
    if (Array.isArray(tables)) {
        for (const t of tables) {
            if (typeof t === "string") {
                out.push([t, []]); // registry-list shape: bare table names
            }
            else if (t && typeof t === "object" && typeof t.name === "string") {
                const cols = t.columns;
                out.push([t.name, Array.isArray(cols) ? cols : []]);
            }
        }
    }
    else if (tables && typeof tables === "object") {
        for (const [name, v] of Object.entries(tables)) {
            const cols = v?.columns;
            out.push([name, Array.isArray(cols) ? cols : []]);
        }
    }
    return out;
}
function colName(c) {
    if (typeof c === "string")
        return c;
    if (c && typeof c === "object" && typeof c.name === "string")
        return c.name;
    return undefined;
}
/** Render staged tables + columns compactly so a "no such column/table" error
 *  can hand the model the exact names to fix its SQL in one step. Handles the
 *  per-server get_schema shape (`{schema:{tables:{name:{columns:[…]}}}}`), the
 *  workspace shape (`{schema:{datasets:[{tables:[…]}]}}`), and the bare forms. */
export function renderStagedSchemaHint(raw) {
    const root = (raw && typeof raw === "object" && "schema" in raw
        ? raw.schema
        : raw);
    if (!root || typeof root !== "object")
        return "";
    const pairs = [];
    if (Array.isArray(root.datasets)) {
        for (const ds of root.datasets) {
            pairs.push(...tableEntries(ds?.tables));
        }
    }
    pairs.push(...tableEntries(root.tables));
    const lines = [];
    for (const [name, cols] of pairs) {
        const names = cols
            .map(colName)
            .filter((n) => typeof n === "string");
        lines.push(`${name}(${names.slice(0, 30).join(", ")}${names.length > 30 ? ", …" : ""})`);
    }
    if (lines.length === 0)
        return "";
    const shown = lines.slice(0, 25);
    return ("\n\nAvailable staged tables & columns — use these EXACT names:\n" +
        shown.join("\n") +
        (lines.length > 25
            ? `\n… and ${lines.length - 25} more (call the _get_schema tool).`
            : ""));
}
/** Cloudflare DO SQLite caps a compound SELECT at ~10 UNION/INTERSECT/EXCEPT
 *  terms (not standard SQLite's ~500). Reframe that engine error into a remedy. */
export function reframeCompoundSelect(msg) {
    if (/too many terms in compound SELECT/i.test(msg)) {
        return ("This dataset runs on Cloudflare DO SQLite, which caps a compound SELECT at ~10 " +
            "UNION/INTERSECT/EXCEPT terms. Split the UNION ALL into batches of at most 8 and combine " +
            "across several query calls, or query the tables individually.");
    }
    return msg;
}
/** Turn a raw staged-query SQL error into an actionable one: append the real
 *  schema for "no such column/table" (fetched via `fetchSchema`); otherwise
 *  reframe the compound-SELECT cap. Best-effort — a failed schema fetch falls
 *  back to the plain (still useful) error, never throws. */
export async function enrichStagedQueryError(msg, fetchSchema) {
    if (/no such (column|table)/i.test(msg)) {
        try {
            const hint = renderStagedSchemaHint(await fetchSchema());
            if (hint)
                return msg + hint;
        }
        catch (e) {
            console.warn("staged schema-hint fetch failed:", e instanceof Error ? e.message : String(e));
        }
    }
    return reframeCompoundSelect(msg);
}
//# sourceMappingURL=query-error-hint.js.map