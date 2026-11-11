import {cellosaurusFetch, fail} from "./http";
import {fetchContextRecord} from "./context-record";

export const CONTEXT_FIELDS = "id,sy,acas,ox,di,dr,cc,str,oi,hi,ch,dt";
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Malformed Cellosaurus context", 502);
  return value as ObjectValue;
}
function list(record: ObjectValue, key: string): ObjectValue[] {
  if (record[key] === undefined) return [];
  if (!Array.isArray(record[key])) fail(`Malformed Cellosaurus ${key}`, 502);
  return record[key].map(object);
}
function release(data: unknown): ObjectValue {
  const value = object(object(object(object(data).Cellosaurus).header).release);
  if (typeof value.version !== "string" || !value.version || typeof value.updated !== "string" || !value.updated) fail("Missing Cellosaurus release identity", 502);
  return value;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${stable(val)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Local composition of existing endpoints, never an archived-release selector. */
export async function cellLineContext(ac: string, params: Record<string, unknown>) {
  for (const key of Object.keys(params)) {
    if (!["expected_release", "xref_database", "xref_accession"].includes(key)) fail(`Unsupported context parameter: ${key}`);
  }
  for (const value of Object.values(params)) if (typeof value !== "string" || !value || value.length > 200) fail("Context parameters must be nonempty strings up to 200 characters");
  if ((params.xref_database === undefined) !== (params.xref_accession === undefined)) fail("Provide both xref_database and xref_accession");
  const signal = AbortSignal.timeout(50_000);
  const before = await cellosaurusFetch("/release-info", {format: "json"}, signal);
  const observed = release(before.data);
  if (params.expected_release !== undefined && params.expected_release !== observed.version) fail("Cellosaurus release does not match expected_release", 409);
  const {response: recordResponse, resolution} = await fetchContextRecord(ac, CONTEXT_FIELDS, signal);
  const { native, primary, requested, after, warningIndexes, record, xrefs } = await validateCellLineContext(recordResponse, ac, signal, observed);
  return {status: 200, data: {
    ...native,
    _cellosaurus: {
      requested_accession: ac, primary_accession: primary[0].value,
      accession_match: requested[0].type,
      record_resolution: resolution,
      release_before: observed, release_after: release(after.data),
      observed_at: new Date().toISOString(), snapshot_is_atomic: false,
      record_url: recordResponse.url, record_sha256: recordResponse.sha256,
      fields: CONTEXT_FIELDS,
      warning_comment_indexes: warningIndexes,
      warning_scope: "Recognized Problematic/Problematic cell line/Caution comment categories only; review all native comments and relationships.",
      warning_status: warningIndexes.length ? "reported" : "not_reported_in_returned_record",
      specimen_authenticated: false,
      str_status: record["str-list"] === undefined ? "not_reported" : "returned_uninterpreted",
      xref_check: params.xref_database === undefined ? null : {
        database: params.xref_database, accession: params.xref_accession,
        matching_xref_indexes: xrefs.flatMap((entry, index) => entry.database === params.xref_database && entry.accession === params.xref_accession ? [index] : []),
        scope: "exact_pair_in_this_record_only", absence_established: false,
      },
      join_policy: "Use exact primary/secondary accession or database+accession pairs. Parent, child and same-individual relationships do not establish identical models. STR profiles and absent warnings do not authenticate specimens. Retain each target dataset's release and model/condition identifiers separately.",
    },
  }};
}

async function validateCellLineContext(recordResponse: { status: number; data: unknown; url: string; sha256: string; }, ac: string, signal: AbortSignal, observed: ObjectValue) {
  const native = object(recordResponse.data);
  const records = list(object(native.Cellosaurus), "cell-line-list");
  if (records.length !== 1) fail("Expected exactly one Cellosaurus cell line", 502);
  const record = records[0];
  const accessions = list(record, "accession-list");
  if (accessions.some(entry => !["primary", "secondary"].includes(String(entry.type)) || typeof entry.value !== "string" || !/^CVCL_[A-Z0-9]{4}$/.test(entry.value))) fail("Invalid Cellosaurus accession list", 502);
  const primary = accessions.filter(entry => entry.type === "primary");
  const requested = accessions.filter(entry => entry.value === ac);
  if (primary.length !== 1 || requested.length !== 1) fail("Cellosaurus accession identity mismatch", 502);
  const xrefs = list(record, "xref-list");
  if (xrefs.some(entry => typeof entry.database !== "string" || typeof entry.accession !== "string")) fail("Invalid Cellosaurus cross-reference", 502);
  const comments = list(record, "comment-list");
  const warningIndexes = comments.flatMap((entry, index) => typeof entry.category === "string" && ["problematic cell line", "problematic", "caution"].includes(entry.category.toLowerCase()) ? [index] : []);
  const after = await cellosaurusFetch("/release-info", { format: "json" }, signal);
  if (stable(observed) !== stable(release(after.data))) fail("Cellosaurus release changed during lookup; retry", 409);
  return { native, primary, requested, after, warningIndexes, record, xrefs };
}
