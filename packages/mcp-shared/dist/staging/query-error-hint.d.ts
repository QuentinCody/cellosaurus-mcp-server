/** Render staged tables + columns compactly so a "no such column/table" error
 *  can hand the model the exact names to fix its SQL in one step. Handles the
 *  per-server get_schema shape (`{schema:{tables:{name:{columns:[…]}}}}`), the
 *  workspace shape (`{schema:{datasets:[{tables:[…]}]}}`), and the bare forms. */
export declare function renderStagedSchemaHint(raw: unknown): string;
/** Cloudflare DO SQLite caps a compound SELECT at ~10 UNION/INTERSECT/EXCEPT
 *  terms (not standard SQLite's ~500). Reframe that engine error into a remedy. */
export declare function reframeCompoundSelect(msg: string): string;
/** Turn a raw staged-query SQL error into an actionable one: append the real
 *  schema for "no such column/table" (fetched via `fetchSchema`); otherwise
 *  reframe the compound-SELECT cap. Best-effort — a failed schema fetch falls
 *  back to the plain (still useful) error, never throws. */
export declare function enrichStagedQueryError(msg: string, fetchSchema: () => Promise<unknown>): Promise<string>;
//# sourceMappingURL=query-error-hint.d.ts.map