import type { TrimmedIntrospection } from "./graphql-introspection";
/**
 * Token-search the trimmed introspection and format the matches for the model.
 * Query-root matches are listed first (they're where a query starts); other
 * matching `Type.field` signatures follow, then a short how-to. Pure + testable;
 * the `<prefix>_search` tool is a thin wrapper that feeds it the cached schema.
 */
export declare function searchTrimmedIntrospection(intro: TrimmedIntrospection, query: string, maxResults?: number): string;
//# sourceMappingURL=graphql-search.d.ts.map