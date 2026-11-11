# cellosaurus-mcp-server

MCP server for the SIB **Cellosaurus** API — the reference knowledge resource on cell lines (~169,000 cell lines: cancer lines, hybridomas, iPSC/ESC, patient-derived, etc.), each keyed by a stable `CVCL_` accession and cross-referenced to ~100 other databases (CCLE/DepMap, Cosmic, ATCC, ChEMBL, PubMed, NCBI Taxonomy, NCIt disease, …).

- Upstream API: https://api.cellosaurus.org (OpenAPI: https://api.cellosaurus.org/openapi.json)
- Upstream site / docs: https://www.cellosaurus.org
- Auth: none
- License: CC BY 4.0 (surfaced as verifiable `_meta.citation` on every `cellosaurus_execute` result)
- Response format: JSON by default (adapter sends `Accept: application/json`); `format=xml|txt|tsv` returned as `{ text }`
- API version: 1.0.4; dataset release is read at runtime from `/release-info`.
- September 28, 2026 review observed release 56.0 (updated June 25), including new EDITGENE and NCI-PDMR cross-references.

## Endpoints (curated from the upstream OpenAPI)

Only three GET methods exist upstream; all are curated in `src/spec/catalog.ts`:

- `GET /cell-line/{ac}` — fetch one record by CVCL accession (category `cell-line`)
- `GET /search/cell-line` — Solr search (`q=`, `start`, `rows`, `fields`, `sort`) (category `search`)
- `GET /release-info` — dataset version / counts (category `release`)

`GET /cell-line/{ac}/context` is a **local helper**, composing the existing release and lookup APIs. It retains the native Cellosaurus envelope and adds `_cellosaurus` evidence.

REST only. Cellosaurus also serves SPARQL/RDF (https://sparql.cellosaurus.org) — noted as a future option, not wired here.

## Tools (Code Mode only)

- `cellosaurus_search` — discover the native endpoints, local context helper and recipes + usage notes from the catalog
- `cellosaurus_execute` — run sandboxed JavaScript against the API via `api.get()` (carries `_meta.citation`)
- `cellosaurus_query_data` — SQL over staged responses
- `cellosaurus_get_schema` — inspect staged-dataset schemas

Large, well-annotated records (e.g. HeLa `CVCL_0030` ≈ 450 KB, Caco-2 `CVCL_0025` ≈ 130 KB compact JSON — verified live) auto-stage past the 30 KB inline threshold into `CellosaurusDataDO`; child arrays (`comment-list`, `xref-list`, `reference-list`, `sequence-variation-list`, …) become SQLite tables. Trim payloads with `fields=` (or a small `rows=`) to keep responses inline.

All four tools also register their `mcp_cellosaurus_*` aliases and carry caller-bound
citations. Complete responses above 30 KiB stage, including composed output, SQL,
schema and errors. `payloads`/`content_chunks` retain the full original response.
Quote table names containing hyphens when querying nested native records.

Search pages add `_cellosaurus` request, source URL/hash, returned count and
`next_start_candidate`. Upstream supplies no total or snapshot cursor; canonical
completeness stays false, including empty or short pages. A next offset does not
establish that another record exists. Searches may include publications alongside
cell lines. Preserve both, along with each page’s source evidence.

## Identity-aware joins

```js
return await api.get('/cell-line/CVCL_0030/context', {
  xref_database: 'DepMap', xref_accession: 'ACH-001086',
  // Optional current-release guard, never a historical selector:
  expected_release: '56.0',
});
```

Use `xref_database: 'PubChem_Cell_line'` and its exact accession to check the
PubChem link. Matching indexes point into the native record's `xref-list`;
all matches survive. Empty matches describe only this record, not global absence.
The helper requests `acas` so a former primary accession can resolve through a
secondary accession. If native lookup returns 404, it performs a bounded exact
`acas:` search and requires one record whose accession list contains the requested
identifier. `record_resolution` records this fallback; ambiguity fails explicitly. Name matches, parent/child lines and lines from the same
individual are not treated as equivalent models. Retain DepMap ModelID,
ModelCondition and release, and PubChem assay/source metadata independently.

The helper preserves raw comments, STR allele strings, source/conflict records,
and cell-line relationships. Warning indexes identify recognized problematic or
caution comment categories; missing warnings do not establish authentication.
No STR matching score or specimen-authentication result is computed.

Release metadata is checked before and after retrieval, with mismatches rejected.
This detects observed drift, not an atomic snapshot. Record URL, observation time
and SHA-256 of the original response bytes are retained separately from record
entry dates/versions. Requests are bounded to 4 MiB each and a shared 50-second
context deadline. Native requests have a 30-second deadline. Repeated `fld`
parameters are supported and retain upstream precedence over `fields`.

Sources: [API fields](https://api.cellosaurus.org/api-fields),
[release notes](https://www.cellosaurus.org/cellosaurus_relnotes.txt),
[HeLa identifiers](https://www.cellosaurus.org/CVCL_0030).

October 3, 2026 native/local Worker acceptance passes through both aliases:
full HeLa, context and exact DepMap/PubChem joins, an observed secondary accession,
problematic-cell-line warnings, EDITGENE/NCI-PDMR pages, all four formats and errors.
Recovered native payloads match independent reads. SQL preserves all 233 HeLa
cross-references, 24 STR markers / 29 allele entries, 32 marker-source records,
17 profile-source records and 83 publications; all 27 generated relationships join.
Deep marker sources remain JSON columns and match their native arrays exactly.

The final runs verify 3,284 MCP calls and citation proofs; complete 80 KB Unicode
outputs and SQL results stage and recover. There are 84 server tests plus shared
regressions. Production and historical snapshots remain unverified. Reproduction:
`scratch/2026-10-03-cellosaurus/` in the monorepo; acceptance details are in
[the implementation tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md).

## Example (Code Mode)

```js
// Resolve HeLa and list its cross-references (dr = xref-list)
const resp = await api.get('/cell-line/{ac}', { ac: 'CVCL_0030', fields: 'id,ac,ox,di,dr' });
if (resp.__staged) return resp; // Inspect its schema and query the staged records.
const cl = resp.Cellosaurus['cell-line-list'][0];
return {
  name: cl['name-list'].find(n => n.type === 'identifier')?.value,
  accession: cl['accession-list'].find(a => a.type === 'primary')?.value,
  xrefs: (cl['xref-list'] || []).map(x => `${x.database}:${x.accession}`),
};
```

```js
// Find human cell lines that have a Cosmic-CLP cross-reference
const resp = await api.get('/search/cell-line', {
  q: 'ox:9606 AND dr:Cosmic-CLP', rows: 20, fields: 'id,ac,di',
});
if (resp.__staged) return resp;
return {accessions: resp.Cellosaurus['cell-line-list'].map(c => c['accession-list'][0].value),
  source: resp._cellosaurus};
```

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from Cellosaurus and stays under the terms of that source: CC BY 4.0.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
