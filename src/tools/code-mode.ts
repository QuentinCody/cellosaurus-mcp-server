import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { cellosaurusCatalog } from "../spec/catalog";
import { createCellosaurusApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    CELLOSAURUS_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createCellosaurusApiFetch();

    const searchTool = createSearchTool({
        prefix: "cellosaurus",
        catalog: cellosaurusCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "cellosaurus",
        // Verifiable provenance: cellosaurus_execute results carry a _meta.citation.
        source: {
            id: "cellosaurus",
            name: "Cellosaurus",
            url: "https://www.cellosaurus.org",
            license: "CC BY 4.0",
        },
        catalog: cellosaurusCatalog,
        apiFetch,
        doNamespace: env.CELLOSAURUS_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
