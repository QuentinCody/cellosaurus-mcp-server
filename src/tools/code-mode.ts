import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { cellosaurusCatalog } from "../spec/catalog";
import { createCellosaurusApiFetch } from "../lib/api-adapter";
import { cellosaurusResponse } from "../lib/tool-result";

/**
 * Interface matching what createSearchTool/createExecuteTool .register() expects.
 * The shared lib calls server.tool(name, description, schema, handler).
 */
interface ToolRegisterable {
    tool: (...args: unknown[]) => void;
}

function toRegisterable(server: McpServer, env: CodeModeEnv): ToolRegisterable {
    return {
        tool(...args: unknown[]) {
            const [base, ...rest] = args;
            const handler = rest.pop() as (input: unknown, extra: unknown) => ReturnType<typeof cellosaurusResponse>;
            for (const name of [String(base), `mcp_${String(base)}`]) {
                const respond = (input: unknown, extra: unknown) => cellosaurusResponse(() => handler(input, extra), env, name, extra, input);
                Function.prototype.apply.call(server.tool, server, [name, ...rest, respond]);
            }
        },
    };
}

/** Minimal shape required from the worker Env for Code Mode registration. */
interface CodeModeEnv {
    CELLOSAURUS_DATA_DO: Pick<Env["CELLOSAURUS_DATA_DO"], "get" | "idFromName">;
    CODE_MODE_LOADER: Env["CODE_MODE_LOADER"];
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const doNamespace = env.CELLOSAURUS_DATA_DO;
    const loader = env.CODE_MODE_LOADER;


    const apiFetch = createCellosaurusApiFetch();
    const registerable = toRegisterable(server, env);

    const searchTool = createSearchTool({
        prefix: "cellosaurus",
        catalog: cellosaurusCatalog,
    });
    searchTool.register(registerable);

    const executeTool = createExecuteTool({
        prefix: "cellosaurus",
        // Verifiable provenance: cellosaurus_execute results carry a _meta.citation.
        source: { id: "cellosaurus", name: "Cellosaurus", url: "https://www.cellosaurus.org", license: "CC BY 4.0" },
        catalog: cellosaurusCatalog,
        apiFetch,
        preserveApiErrors: true,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        timeout: 60000,
        doNamespace,
        loader,
    });
    executeTool.register(registerable);
}
