/// <reference types="node" />
import {DatabaseSync, type SQLInputValue} from "node:sqlite";
import {expect, it, vi} from "vitest";
vi.mock("cloudflare:workers", () => ({RpcTarget: class {}, DurableObject: class {constructor(public ctx: unknown, public env: unknown) {}}}));
import {CellosaurusDataDO} from "../do";
import {McpServer} from "@bio-mcp/shared/mcp";
import {createApiProxyTool} from "@bio-mcp/shared/tools/api-proxy";
import {cellosaurusCatalog} from "../spec/catalog";
import {registerQueryData} from "./query-data";
import {registerGetSchema} from "./get-schema";

it.each([false, true])("keeps native tables, relationships and complete payloads with context=%s", async context => {
  const db = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const sql = {exec: (query: string, ...values: SQLInputValue[]) => {
    const rows = db.prepare(query).all(...values); const iterator = rows[Symbol.iterator]();
    return {toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator};
  }};
  const transactionSync = <T>(run: () => T): T => {
    db.exec("BEGIN"); try {const value = run(); db.exec("COMMIT"); return value;}
    catch (error) {db.exec("ROLLBACK"); throw error;}
  };
  const ctx = {storage: {sql, transactionSync}, blockConcurrencyWhile: (run: () => Promise<void>) => {ready = run(); return ready;}};
  const instance = new CellosaurusDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {await ready; return instance.fetch(request);}})} as unknown as Env["CELLOSAURUS_DATA_DO"];
  const native = {Cellosaurus: {
    "cell-line-list": [{"entry-version": "0007", "accession-list": [{type: "primary", value: "CVCL_0030"}],
      "xref-list": [{database: "PubMed", accession: "0000123"}, {database: "DepMap", accession: "ACH-001086"}],
      "comment-list": [{category: "Caution", value: "α🧬".repeat(12000)}],
      "str-list": {"marker-list": [{id: "TH01", conflict: "true", "marker-data-list": [{"marker-alleles": "9.30"}, {"marker-alleles": "6,9.3"}]}]},
    }],
    "publication-list": [{"internal-id": "0001", volume: "003", "author-list": [{"first-names": "Ada", "last-name": "Smith"}]}],
  }, ...(context ? {_cellosaurus: {requested_accession: "CVCL_0030", specimen_authenticated: false, release_before: {version: "56.0"}}} : {})};
  const proxy = createApiProxyTool({apiFetch: async () => ({status: 200, data: native}), catalog: cellosaurusCatalog, doNamespace: namespace, stagingPrefix: "cellosaurus", maxInlineBytes: 30720});
  const server = new McpServer({name: "fixture", version: "1"});
  registerQueryData(server, {CELLOSAURUS_DATA_DO: namespace}); registerGetSchema(server, {CELLOSAURUS_DATA_DO: namespace});
  const tools = (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<any>}>})._registeredTools;
  try {
    const staged = await proxy.handler({method: "GET", path: "/cell-line/CVCL_0030"}, {sql: () => []}) as {data_access_id: string};
    for (const prefix of ["", "mcp_"]) {
      const rows = async (query: string) => {
        const result = await tools[`${prefix}cellosaurus_query_data`].handler({data_access_id: staged.data_access_id, sql: query, limit: 100}, {});
        expect(result.isError, JSON.stringify(result)).not.toBe(true);
        return result.structuredContent.data.rows;
      };
      const schema = await tools[`${prefix}cellosaurus_get_schema`].handler({data_access_id: staged.data_access_id}, {});
      expect(schema.isError, JSON.stringify(schema)).not.toBe(true);
      expect(schema.structuredContent.data.schema.tables['cell_line_list_xref-list'].row_count).toBe(2);
      expect(schema.structuredContent.data.schema.tables.publication_list.row_count).toBe(1);
      expect(await rows('SELECT p."entry-version", x.accession FROM cell_line_list p JOIN "cell_line_list_xref-list" x ON x.parent_id=p._rowid ORDER BY x._rowid')).toEqual([{"entry-version": "0007", accession: "0000123"}, {"entry-version": "0007", accession: "ACH-001086"}]);
      expect(await rows('SELECT "marker-alleles" FROM "cell_line_list_str-list_marker-list_marker-data-list" ORDER BY _rowid')).toEqual([{"marker-alleles": "9.30"}, {"marker-alleles": "6,9.3"}]);
      expect(await rows('SELECT "internal-id", volume FROM publication_list')).toEqual([{"internal-id": "0001", volume: "003"}]);
      const root = (await rows("SELECT root_json FROM payloads ORDER BY id LIMIT 1"))[0].root_json;
      expect(root).toMatch(/^__CHUNKED__:/);
      let raw = "";
      const chunks = await rows(`SELECT chunk_index, length(chunk_data) AS n FROM content_chunks WHERE content_id='${root.slice(12)}' ORDER BY chunk_index`);
      for (const chunk of chunks) for (let start = 1; start <= chunk.n; start += 2000) raw += (await rows(`SELECT substr(chunk_data,${start},2000) AS part FROM content_chunks WHERE content_id='${root.slice(12)}' AND chunk_index=${chunk.chunk_index}`))[0].part;
      const decoded = JSON.parse(raw);
      expect(typeof decoded === "string" ? JSON.parse(decoded) : decoded).toEqual(native);
    }
  } finally {db.close();}
});
