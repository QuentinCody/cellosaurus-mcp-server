import {afterEach, describe, expect, it, vi} from "vitest";
import {createCellosaurusApiFetch} from "./api-adapter";
import {CONTEXT_FIELDS} from "./context";
const api = createCellosaurusApiFetch();
const release = (version = "56.0", updated = "2026-06-25") => ({Cellosaurus: {header: {release: {version, updated, "nb-cell-lines": "168970"}}}});
const record = () => ({
  "accession-list": [{type: "primary", value: "CVCL_0030"}, {type: "secondary", value: "CVCL_AAAA"}],
  "name-list": [{type: "identifier", value: "Synthetic fixture"}],
  "xref-list": [
    {database: "DepMap", accession: "ACH-001086"}, {database: "Other", accession: "ACH-001086"},
    {database: "DepMap", accession: "ACH-000001"}, {database: "PubChem_Cell_line", accession: "CVCL_0030"},
    {database: "EDITGENE", accession: "fixture"}, {database: "NCI-PDMR", accession: "fixture2"},
  ],
  "comment-list": [{category: "Problematic cell line", value: "Synthetic warning", "source-list": [{reference: {"resource-internal-ref": "fixture"}}]}, {category: "Caution", value: "Synthetic caution"}, {category: "Miscellaneous", value: "Not a classified warning"}],
  "str-list": {"marker-list": [{id: "TH01", conflict: "true", "marker-data-list": [{"marker-alleles": "6,9.3"}, {"marker-alleles": "9.3"}]}], "source-list": [{xref: {database: "fixture", accession: "s1"}}]},
  "parent-list": [{accession: {type: "primary", value: "CVCL_BBBB"}}],
  "same-origin-as-list": [{accession: {type: "primary", value: "CVCL_CCCC"}}],
  created: "2012-04-04", updated: "2026-03-01", version: "12",
});
const json = (data: unknown) => new Response(JSON.stringify(data), {headers: {"content-type": "application/json"}});
function mock(records: unknown[] = [record()], before: unknown = release(), after: unknown = release()) {
  return vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(before)).mockResolvedValueOnce(json({Cellosaurus: {"cell-line-list": records}})).mockResolvedValueOnce(json(after)));
}
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
const context = (params = {}, ac = "CVCL_0030") => api({method: "GET", path: `/cell-line/${ac}/context`, params});

it("retains native search records, source hash and a bounded continuation without asserting completeness", async () => {
  const native = {Cellosaurus: {"cell-line-list": [record()]}};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(native)));
  const result = await api({method: "GET", path: "/search/cell-line", params: {q: "id:HeLa", rows: 1, start: 10}});
  expect(result.data).toMatchObject({...native, _cellosaurus: {kind: "search_page", complete: false, returned: 1, total_available: null, next_start_candidate: 11, source_sha256: expect.stringMatching(/^[0-9a-f]{64}$/)}});
  expect(result.completeness).toEqual({complete: false, returned: 1, truncation: {reason: "page_limit", detail: "One Cellosaurus search page; the native response provides no total or snapshot cursor.", remedy: "Use start/rows for bounded continuation; retain each page and its source evidence."}});
});
it("keeps empty and text searches incomplete", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({Cellosaurus: {"cell-line-list": []}})).mockResolvedValueOnce(new Response("native text")));
  const empty = await api({method: "GET", path: "/search/cell-line", params: {q: "absent"}});
  expect(empty.data).toMatchObject({_cellosaurus: {complete: false, returned: 0, next_start_candidate: null}});
  const text = await api({method: "GET", path: "/search/cell-line", params: {format: "txt"}});
  expect(text.data).toMatchObject({text: "native text", _cellosaurus: {returned: null, complete: false}});
  expect(text.completeness?.complete).toBe(false);
});
it.each([{rows: -1}, {rows: 1.5}, {start: -1}, {start: "9007199254740992"}, {start: Number.MAX_SAFE_INTEGER, rows: 1}, {unsupported: "x"}])("rejects invalid search windows/options before networking %#", async params => {
  vi.stubGlobal("fetch", vi.fn());
  await expect(api({method: "GET", path: "/search/cell-line", params})).rejects.toMatchObject({status: 400});
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects a JSON search success missing its record array", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(release())));
  await expect(api({method: "GET", path: "/search/cell-line"})).rejects.toMatchObject({status: 502});
});

it("retains exact identity, all native evidence and separate release/entry versions", async () => {
  mock(); const result = await context({expected_release: "56.0", xref_database: "DepMap", xref_accession: "ACH-001086"});
  expect(result).toMatchObject({data: {Cellosaurus: {"cell-line-list": [record()]}, _cellosaurus: {
    primary_accession: "CVCL_0030", accession_match: "primary", release_before: {version: "56.0"},
    warning_comment_indexes: [0, 1], warning_status: "reported", specimen_authenticated: false,
    str_status: "returned_uninterpreted", snapshot_is_atomic: false,
    xref_check: {matching_xref_indexes: [0], absence_established: false}, record_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  }}});
  const calls = vi.mocked(fetch).mock.calls;
  expect(new URL(String(calls[1][0])).searchParams.get("fields")).toBe(CONTEXT_FIELDS);
  expect(calls.map(call => call[1]?.signal)).toEqual([calls[0][1]?.signal, calls[0][1]?.signal, calls[0][1]?.signal]);
});
it("resolves a secondary accession only from its exact accession-list", async () => {
  mock(); expect(await context({}, "CVCL_AAAA")).toMatchObject({data: {_cellosaurus: {accession_match: "secondary", primary_accession: "CVCL_0030"}}});
});
it("resolves native lookup 404 through an exact bounded accession search", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(release())).mockResolvedValueOnce(new Response("not found", {status: 404}))
    .mockResolvedValueOnce(json({Cellosaurus: {"cell-line-list": [record()]}})).mockResolvedValueOnce(json(release())));
  expect(await context({}, "CVCL_AAAA")).toMatchObject({data: {_cellosaurus: {accession_match: "secondary", primary_accession: "CVCL_0030", record_resolution: "exact_acas_search_after_lookup_404"}}});
  const calls = vi.mocked(fetch).mock.calls;
  expect(new URL(String(calls[2][0])).searchParams.get("q")).toBe("acas:CVCL_AAAA");
  expect(new URL(String(calls[2][0])).searchParams.get("rows")).toBe("2");
  expect(calls.every(call => call[1]?.signal === calls[0][1]?.signal)).toBe(true);
});
it.each([
  {records: [], status: 404},
  {records: [record(), record()], status: 502},
  {records: [{"accession-list": [{type: "primary", value: "CVCL_0030"}]}], status: 502},
])("rejects absent, ambiguous or inexact fallback matches %#", async ({records, status}) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(release())).mockResolvedValueOnce(new Response("not found", {status: 404}))
    .mockResolvedValueOnce(json({Cellosaurus: {"cell-line-list": records}})));
  await expect(context({}, "CVCL_AAAA")).rejects.toMatchObject({status});
});
it("does not reinterpret an upstream server failure as a secondary accession", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(release())).mockResolvedValueOnce(new Response("failed", {status: 503})));
  await expect(context({}, "CVCL_AAAA")).rejects.toMatchObject({status: 503});
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not match parent or same-individual identifiers", async () => {
  mock(); await expect(context({}, "CVCL_BBBB")).rejects.toThrow("identity mismatch");
});
it("does not infer absence or authentication from missing optional evidence", async () => {
  mock([{"accession-list": record()["accession-list"]}]);
  expect(await context({xref_database: "DepMap", xref_accession: "ACH-001086"})).toMatchObject({data: {_cellosaurus: {warning_status: "not_reported_in_returned_record", specimen_authenticated: false, str_status: "not_reported", xref_check: {matching_xref_indexes: [], absence_established: false}}}});
});
it("does not normalize database names or accession prefixes", async () => {
  mock(); expect(await context({xref_database: "depmap", xref_accession: "ACH-001086"})).toMatchObject({data: {_cellosaurus: {xref_check: {matching_xref_indexes: []}}}});
});
it("keeps multiple exact xref matches", async () => {
  const value = record(); value["xref-list"].push(value["xref-list"][0]); mock([value]);
  expect(await context({xref_database: "DepMap", xref_accession: "ACH-001086"})).toMatchObject({data: {_cellosaurus: {xref_check: {matching_xref_indexes: [0, 6]}}}});
});
it.each([release("57.0"), release("56.0", "2026-07-01"), {Cellosaurus: {header: {release: {version: "56.0", updated: "2026-06-25", "nb-cell-lines": "2"}}}}])("rejects observed release drift", async after => {
  mock([record()], release(), after); await expect(context()).rejects.toMatchObject({status: 409});
});
it("checks expected release before fetching a record", async () => {
  mock(); await expect(context({expected_release: "55.0"})).rejects.toMatchObject({status: 409}); expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([{}, {Cellosaurus: {}}, {Cellosaurus: {header: {release: {version: 56, updated: "2026-06-25"}}}}])("rejects malformed release identity", async before => {
  mock([record()], before); await expect(context()).rejects.toMatchObject({status: 502});
});
it.each([[], [record(), record()], [{"accession-list": []}], [{"accession-list": [{type: "primary", value: "CVCL_0030"}, {type: "primary", value: "CVCL_AAAA"}]}], [{...record(), "xref-list": [{database: "DepMap", accession: 12}]}], [{...record(), "comment-list": {category: "Caution"}}]].map(records => ({records})))("rejects ambiguous or malformed record evidence", async ({records}) => {
  mock(records); await expect(context()).rejects.toMatchObject({status: 502});
});
it.each([{expected_release: 56}, {expected_release: ""}, {fields: "ac"}, {xref_database: "DepMap"}, {xref_accession: "ACH-1"}])("rejects incomplete or unsupported context options before networking", async params => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await expect(context(params)).rejects.toMatchObject({status: 400}); expect(fetcher).not.toHaveBeenCalled();
});
describe("native routes and bounded transport", () => {
  it("preserves release data and repeated fld parameters", async () => {
    const native = {Cellosaurus: {"cell-line-list": [record()]}};
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(native)));
    const result = await api({method: "GET", path: "/search/cell-line", params: {q: "id:HeLa", fld: ["acas", "str"], fields: "id"}});
    expect(result.data).toMatchObject(native); const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.getAll("fld")).toEqual(["acas", "str"]);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({redirect: "manual", headers: {Accept: "application/json"}});
  });
  it.each(["xml", "txt", "tsv"])("retains explicit %s format as text", async format => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("raw data")));
    expect(await api({method: "GET", path: "/release-info", params: {format}})).toEqual({status: 200, data: {text: "raw data"}});
  });
  it.each(["https://other.test/", "//other.test/", "/cell-line/CVCL_0030/../release-info", "/cell-line/CVCL_0030?fields=ac", "/unknown"])("rejects unsupported path %s", async path => {
    vi.stubGlobal("fetch", vi.fn()); await expect(api({method: "GET", path})).rejects.toMatchObject({status: 400}); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects writes", async () => {await expect(api({method: "POST", path: "/release-info"})).rejects.toMatchObject({status: 400});});
  it("does not echo upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private diagnostic", {status: 404})));
    await expect(api({method: "GET", path: "/release-info"})).rejects.toThrow("Cellosaurus HTTP 404");
  });
  it.each([new Response("<html>error</html>"), new Response("{", {headers: {"content-type": "application/json"}}), json({message: "error"})])("rejects non-data successes", async response => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response)); await expect(api({method: "GET", path: "/release-info"})).rejects.toMatchObject({status: 502});
  });
  it("rejects oversized multibyte responses and cancels their streams", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode("α".repeat(3 * 1024 * 1024)));}, cancel});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {headers: {"content-type": "application/json"}})));
    await expect(api({method: "GET", path: "/release-info"})).rejects.toThrow("4 MiB"); expect(cancel).toHaveBeenCalled();
  });
});
