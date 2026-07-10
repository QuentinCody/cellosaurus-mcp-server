# cellosaurus-mcp-server

MCP server for the SIB **Cellosaurus** API — the reference knowledge resource on cell lines (~169,000 cell lines: cancer lines, hybridomas, iPSC/ESC, patient-derived, etc.), each keyed by a stable `CVCL_` accession and cross-referenced to ~100 other databases (CCLE/DepMap, Cosmic, ATCC, ChEMBL, PubMed, NCBI Taxonomy, NCIt disease, …).

- Upstream API: https://api.cellosaurus.org (OpenAPI: https://api.cellosaurus.org/openapi.json)
- Upstream site / docs: https://www.cellosaurus.org
- Auth: none
- License: CC BY 4.0 (surfaced as verifiable `_meta.citation` on every `cellosaurus_execute` result)
- Response format: JSON by default (adapter sends `Accept: application/json`); `format=xml|txt|tsv` returned as `{ text }`
- Release at build time: v56.0 (~168,970 cell lines)

## Endpoints (curated from the upstream OpenAPI)

Only three GET methods exist upstream; all are curated in `src/spec/catalog.ts`:

- `GET /cell-line/{ac}` — fetch one record by CVCL accession (category `cell-line`)
- `GET /search/cell-line` — Solr search (`q=`, `start`, `rows`, `fields`, `sort`) (category `search`)
- `GET /release-info` — dataset version / counts (category `release`)

REST only. Cellosaurus also serves SPARQL/RDF (https://sparql.cellosaurus.org) — noted as a future option, not wired here.

## Tools (Code Mode only)

- `cellosaurus_search` — discover the 3 curated endpoints + usage notes from the catalog
- `cellosaurus_execute` — run sandboxed JavaScript against the API via `api.get()` (carries `_meta.citation`)
- `cellosaurus_query_data` — SQL over staged responses
- `cellosaurus_get_schema` — inspect staged-dataset schemas

Large, well-annotated records (e.g. HeLa `CVCL_0030` ≈ 450 KB, Caco-2 `CVCL_0025` ≈ 130 KB compact JSON — verified live) auto-stage past the 30 KB inline threshold into `CellosaurusDataDO`; child arrays (`comment-list`, `xref-list`, `reference-list`, `sequence-variation-list`, …) become SQLite tables. Trim payloads with `fields=` (or a small `rows=`) to keep responses inline.

## Example (Code Mode)

```js
// Resolve HeLa and list its cross-references (dr = xref-list)
const resp = await api.get('/cell-line/{ac}', { ac: 'CVCL_0030', fields: 'id,ac,ox,di,dr' });
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
return resp.Cellosaurus['cell-line-list'].map(c => c['accession-list'][0].value);
```
