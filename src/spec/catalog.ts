import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

/**
 * Cellosaurus REST API catalog.
 *
 * Cellosaurus (SIB) is the reference knowledge resource on cell lines: ~169,000
 * cell lines (cancer lines, hybridomas, iPSC/ESC, patient-derived, etc.), each
 * keyed by a stable `CVCL_` accession and richly cross-referenced to ~100 other
 * databases (CCLE/DepMap, Cosmic, ATCC, ExPASy, ChEMBL, PubMed, NCBI Taxonomy,
 * NCIt disease, etc.), with STR profiles, misidentification/contamination
 * warnings, hierarchy (parent/child, derived-from-same-individual), sequence
 * variations, HLA typing, and doubling times.
 *
 * The upstream OpenAPI (https://api.cellosaurus.org/openapi.json) exposes only
 * three GET methods; all are curated below. They are grouped into three
 * categories: `cell-line` (lookup by accession), `search` (Solr query), and
 * `release` (dataset version/counts).
 *
 * Future option: Cellosaurus also serves SPARQL/RDF (https://sparql.cellosaurus.org)
 * and bulk dumps — intentionally NOT covered here (this server is REST-only).
 */
export const cellosaurusCatalog: ApiCatalog = {
    name: "Cellosaurus",
    baseUrl: "https://api.cellosaurus.org",
    version: "1.0.4",
    auth: "none",
    endpointCount: 4,
    notes:
        "- LOCAL CONTEXT: /cell-line/{ac}/context composes existing endpoints; native data plus _cellosaurus release/identity evidence. Missing warnings are not proof of authentication; raw STR alleles/conflicts/sources remain uninterpreted. Release 56 (June 2026) added EDITGENE and NCI-PDMR cross-references, retained without a database allowlist. API version 1.0.4 is separate from runtime dataset release.\n" +
        "- ENVELOPE: every response is wrapped `{ Cellosaurus: { \"cell-line-list\": [ ...records ], \"publication-list\"?: [...], \"header\"?: {...} } }`. Always read `resp.Cellosaurus['cell-line-list']`. Full records and searches can also carry a sibling `publication-list`; preserve it alongside the cell lines.\n" +
        "- ACCESSION (field AC): the primary id is `CVCL_xxxx` (e.g. HeLa=CVCL_0030, Caco-2=CVCL_0025, MCF-7=CVCL_0031, A549=CVCL_0023, Jurkat=CVCL_0065). Native lookup may return 404 for a secondary accession. The local context helper then searches `acas:` and requires exactly one exact accession-list match.\n" +
        "- FORMAT: JSON is the default (the adapter sends `Accept: application/json`; no `format` param needed). Pass `format=txt` (Cellosaurus flat-file), `format=tsv`, or `format=xml` to get other formats — those come back as `{ text }`. Values: json | xml | txt | tsv.\n" +
        "- FIELD SELECTION: trim big records with `fields=` (comma-separated field tags/shortnames), e.g. `fields=id,ac,ox,di,dr,str`. 60 tags exist; key ones: id (recommended name), sy (synonyms), ac (primary only), acas (primary and secondary accessions; use for joins), ca (category), ox (species / NCBI TaxID), sx (sex), ag (age at sampling), di (disease, w/ NCIt), dr (cross-references → xref-list), cc (comments), str (STR profile), oi (originate-from-same-individual), hi/ch (hierarchy: parent/child), sequence-variation, hla, genome-ancestry, derived-from-site, doubling-time, misspelling, dt (dates: created/updated/version). `fld` (repeated array param) is the alternative to `fields` and takes precedence if both are given.\n" +
        "- SEARCH (Solr syntax on `q=`): field-scoped queries are the most reliable. Verified working: `id:HeLa`, `ac:CVCL_0030`, `sy:<synonym>`, `ox:9606` (human by NCBI TaxID), `dr:Cosmic-CLP` (has a cross-ref to that database), `di:<term-or-NCIt-id>`, combined with AND/OR — e.g. `q=ox:9606 AND dr:Cosmic-CLP`. Quote multi-word phrases. Page with `start` (offset, default 0) + `rows` (default 1000); order with `sort=<field ASC|DESC>`. A bare `q=<text>` does a free-text search. Results add `_cellosaurus` request/source evidence, returned count and `next_start_candidate`. No total or snapshot cursor is supplied by upstream: canonical completeness stays false, including empty/short pages. A next offset is a continuation candidate, not proof of additional records.\n" +
        "- CROSS-REFERENCES: there is no dedicated xref endpoint — fetch a line with `fields=dr` to populate its `xref-list` (each entry has database, accession, category, url, iri), or reverse-search with `q=dr:<database>`.\n" +
        "- LARGE RECORDS / STAGING: a well-annotated line (HeLa CVCL_0030 ≈ 450 KB, Caco-2 CVCL_0025 ≈ 130 KB compact JSON) far exceeds the 30 KB inline threshold — and the well-annotated ones also exceed the 100 KB MCP transport cap, so staging is effectively mandatory — and auto-stages; its child arrays (comment-list, xref-list, reference-list, sequence-variation-list, and nested STR marker/source arrays) become SQLite tables. Entire tool envelopes also stage above 30 KiB, including composed output, SQL, schema and errors. The original envelope remains recoverable from payloads/content_chunks; quote hyphenated table names in SQL. Use `cellosaurus_query_data` to SQL over them and `cellosaurus_get_schema` to inspect the staged shape. Prefer `fields=` (or a small `rows=`) to keep responses inline when you only need a few fields.\n" +
        "- ERRORS: an unknown accession returns HTTP 404 with `{ code, message }` (e.g. `{ code: 404, message: \"Item not found, ac: CVCL_NOPE\" }`).",
    workflows: [
      {title: "Cell line identity and contamination context", description: "Retain exact accession aliases, raw comments/STR/relationships and before/after release metadata. No specimen authentication or historical snapshot is implied.", keywords: ["contamination", "STR", "release", "identity"], code: "return await api.get('/cell-line/CVCL_1906/context');"},
      {title: "DepMap exact model cross-reference", description: "Check a database/accession pair on the Cellosaurus record. Retain target DepMap release, ModelID and ModelCondition identifiers independently; do not collapse related cell lines.", keywords: ["DepMap", "join", "model", "ACH"], code: "return await api.get('/cell-line/CVCL_0030/context', {xref_database: 'DepMap', xref_accession: 'ACH-001086'});"},
      {title: "PubChem cell line evidence join", description: "Check the PubChem_Cell_line identifier with full cell-line context before joining assays. Preserve PubChem assay/source metadata; no assay-result or compound identity is inferred.", keywords: ["PubChem", "join", "assay", "cell line"], code: "return await api.get('/cell-line/CVCL_0030/context', {xref_database: 'PubChem_Cell_line', xref_accession: 'CVCL_0030'});"},
    ],
    endpoints: [
      {
        method: "GET", path: "/cell-line/{ac}/context", category: "cell-line", coveredByTool: "cellosaurus_search",
        summary: "LOCAL Cellosaurus helper: accession-checked cell-line context with native warnings, STR, cross-references and relationships. Checks /release-info before/after; expected_release rejects drift but never selects an archive. Exact xref pair checks apply only to the returned record.",
        pathParams: [{name: "ac", type: "string", required: true, description: "Primary or secondary CVCL_ accession."}],
        queryParams: [
          {name: "expected_release", type: "string", required: false, description: "Optional exact current dataset version guard; not API version or historical selector."},
          {name: "xref_database", type: "string", required: false, description: "Exact database name, e.g. DepMap, PubChem_Cell_line, EDITGENE or NCI-PDMR. Requires xref_accession."},
          {name: "xref_accession", type: "string", required: false, description: "Exact accession within xref_database; no name normalization or fuzzy matching."},
        ],
      },
        // ── cell-line (lookup by accession) ────────────────────────────────
        {
            method: "GET",
            path: "/cell-line/{ac}",
            summary:
                "Fetch one cell-line record by its Cellosaurus accession (CVCL_ id). Returns the full entry — name-list, accession-list, category, species (ox), disease (di), sex/age, cross-references (xref-list / dr), STR profile, comments, hierarchy, references — unwrap at Cellosaurus['cell-line-list'][0].",
            category: "cell-line",
            pathParams: [
                {
                    name: "ac",
                    type: "string",
                    required: true,
                    description: "Cellosaurus accession (field AC), e.g. CVCL_0030 (HeLa) or CVCL_0025 (Caco-2).",
                },
            ],
            queryParams: [
                {name: "fld", type: "array", required: false, description: "Repeated field tags; takes precedence over fields."},
                {
                    name: "fields",
                    type: "string",
                    required: false,
                    description:
                        "Comma-separated field tags to return (trims large records). Examples: 'id,ac,ox,di,dr', 'id,sy,cc,str'. Omit to return all fields.",
                },
                {
                    name: "format",
                    type: "string",
                    required: false,
                    description: "Response format. JSON is the default; xml/txt/tsv are returned as { text }.",
                    enum: ["json", "xml", "txt", "tsv"],
                },
            ],
            coveredByTool: "cellosaurus_search",
        },
        // ── search (Solr query) ────────────────────────────────────────────
        {
            method: "GET",
            path: "/search/cell-line",
            summary:
                "Search cell lines with Solr syntax. Field-scoped queries recommended: id:, ac:, sy:, ox: (NCBI TaxID), dr: (cross-ref database), di: (disease), combined with AND/OR. Returns matching records at Cellosaurus['cell-line-list'].",
            category: "search",
            queryParams: [
                {name: "fld", type: "array", required: false, description: "Repeated field tags; takes precedence over fields."},
                {
                    name: "q",
                    type: "string",
                    required: false,
                    description:
                        "Solr query. Examples: 'id:HeLa', 'ac:CVCL_0030', 'ox:9606 AND dr:Cosmic-CLP', 'sy:\"cervical carcinoma\"'. Defaults to 'id:HeLa' if omitted.",
                    default: "id:HeLa",
                },
                {
                    name: "fields",
                    type: "string",
                    required: false,
                    description:
                        "Comma-separated field tags to return per hit (e.g. 'id,ac,ox,di'). Omit to return all fields — combine with a small 'rows' to avoid staging.",
                },
                {
                    name: "start",
                    type: "number",
                    required: false,
                    description: "Zero-based index of the first hit to return (pagination offset).",
                    default: 0,
                },
                {
                    name: "rows",
                    type: "number",
                    required: false,
                    description: "Number of hits to return (Solr 'rows'). Upstream default is 1000; set a small value (e.g. 20) to keep results inline.",
                    default: 1000,
                },
                {
                    name: "sort",
                    type: "string",
                    required: false,
                    description: "Sort order: '<field> ASC|DESC' (space-separated), e.g. 'id ASC'. Multiple comma-separated clauses allowed.",
                },
                {
                    name: "format",
                    type: "string",
                    required: false,
                    description: "Response format. JSON is the default; xml/txt/tsv are returned as { text }.",
                    enum: ["json", "xml", "txt", "tsv"],
                },
            ],
            coveredByTool: "cellosaurus_search",
        },
        // ── release (dataset metadata) ─────────────────────────────────────
        {
            method: "GET",
            path: "/release-info",
            summary:
                "Get the current Cellosaurus release: version, number of cell lines, number of publications, and last-updated date (at Cellosaurus.header.release).",
            category: "release",
            queryParams: [
                {
                    name: "format",
                    type: "string",
                    required: false,
                    description: "Response format. JSON is the default; xml/txt/tsv are returned as { text }.",
                    enum: ["json", "xml", "txt", "tsv"],
                },
            ],
            coveredByTool: "cellosaurus_search",
        },
    ],
};
