import {afterEach, expect, it, vi} from "vitest";
import {McpServer} from "@bio-mcp/shared/mcp";
import {createApiProxyTool} from "@bio-mcp/shared/tools/api-proxy";
import {registerCodeMode} from "./code-mode";
import {registerGetSchema} from "./get-schema";
import {registerQueryData} from "./query-data";
import {cellosaurusCatalog} from "../spec/catalog";
import {createCellosaurusApiFetch} from "../lib/api-adapter";
const json = (data: unknown) => new Response(JSON.stringify(data), {headers: {"Content-Type": "application/json"}});
afterEach(() => vi.unstubAllGlobals());
it("registers all four tools under both aliases with both fields on success/error", async () => {
  const server = new McpServer({name: "fixture", version: "1"});
  registerCodeMode(server, {CODE_MODE_LOADER: {get: () => ({})}} as unknown as Parameters<typeof registerCodeMode>[1]);
  registerGetSchema(server, {}); registerQueryData(server, {});
  const tools = (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<unknown>}>})._registeredTools;
  for (const suffix of ["search", "execute", "query_data", "get_schema"]) {
    expect(tools[`cellosaurus_${suffix}`]).toBeDefined(); expect(tools[`mcp_cellosaurus_${suffix}`]).toBeDefined();
  }
  expect(await tools.cellosaurus_search.handler({query: "cell line", max_results: 5}, {})).toMatchObject({content: expect.any(Array), structuredContent: {success: true}});
  expect(await tools.mcp_cellosaurus_query_data.handler({data_access_id: "fixture", sql: "SELECT 1"}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
});
it("stages the complete context and native evidence", async () => {
  const release = {Cellosaurus: {header: {release: {version: "56.0", updated: "2026-06-25"}}}};
  const native = {Cellosaurus: {"cell-line-list": [{
    "accession-list": [{type: "primary", value: "CVCL_0030"}],
    "comment-list": [{category: "Caution", value: "α".repeat(20000)}],
    "xref-list": [{database: "DepMap", accession: "ACH-001086"}],
    "str-list": {"marker-list": [{id: "TH01", conflict: "true", "marker-data-list": [{"marker-alleles": "6,9.3"}]}]},
  }]}};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(release)).mockResolvedValueOnce(json(native)).mockResolvedValueOnce(json(release)));
  const stored: unknown[] = [];
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") { stored.push((await request.json() as {data: unknown}).data); return json({success: true, tables_created: ["payloads"], total_rows: 1}); }
    return json({success: true, schema: {tables: {payloads: {columns: [{name: "root_json"}]}}}});
  }})} as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({apiFetch: createCellosaurusApiFetch(), catalog: cellosaurusCatalog, doNamespace: namespace, stagingPrefix: "cellosaurus", maxInlineBytes: 30 * 1024});
  const result = await proxy.handler({method: "GET", path: "/cell-line/CVCL_0030/context"}, {sql: () => []});
  expect(result).toMatchObject({__staged: true, data_access_id: expect.any(String)});
  expect(JSON.parse(stored[0] as string)).toMatchObject({...native, _cellosaurus: {primary_accession: "CVCL_0030", warning_comment_indexes: [0], release_before: {version: "56.0"}, specimen_authenticated: false}});
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(100000);
});
it("propagates invalid context options as an incomplete API error", async () => {
  const proxy = createApiProxyTool({apiFetch: createCellosaurusApiFetch(), catalog: cellosaurusCatalog, stagingPrefix: "cellosaurus"});
  expect(await proxy.handler({method: "GET", path: "/cell-line/CVCL_0030/context", params: {xref_database: "DepMap"}}, {sql: () => []})).toMatchObject({__api_error: true, incomplete: true, status: 400});
});
