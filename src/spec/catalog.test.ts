/**
 * Co-located smoke test for the Cellosaurus REST catalog.
 * Verifies the curated surface stays internally consistent with the upstream
 * OpenAPI (three GET methods) and the conventions this server relies on.
 */
import { describe, expect, it } from "vitest";
import { cellosaurusCatalog } from "./catalog";

describe("cellosaurusCatalog (smoke)", () => {
    it("declares the canonical name, base URL, and no-auth", () => {
        expect(cellosaurusCatalog.name).toBe("Cellosaurus");
        expect(cellosaurusCatalog.baseUrl).toBe("https://api.cellosaurus.org");
        expect(cellosaurusCatalog.auth).toBe("none");
    });

    it("endpointCount stays in sync with endpoints.length", () => {
        expect(cellosaurusCatalog.endpointCount).toBe(cellosaurusCatalog.endpoints.length);
    });

    it("exposes exactly the three verified GET endpoints, all covered by the search tool", () => {
        const paths = cellosaurusCatalog.endpoints.map((e) => e.path).sort();
        expect(paths).toEqual(["/cell-line/{ac}", "/release-info", "/search/cell-line"]);
        for (const e of cellosaurusCatalog.endpoints) {
            expect(e.method).toBe("GET");
            expect(e.coveredByTool).toBe("cellosaurus_search");
        }
    });

    it("covers the cell-line, search, and release categories", () => {
        const categories = new Set(cellosaurusCatalog.endpoints.map((e) => e.category));
        expect(categories).toEqual(new Set(["cell-line", "search", "release"]));
    });

    it("the lookup endpoint requires an `ac` path param; search takes an `hgvs`-free Solr `q`", () => {
        const byAc = cellosaurusCatalog.endpoints.find((e) => e.path === "/cell-line/{ac}");
        const search = cellosaurusCatalog.endpoints.find((e) => e.path === "/search/cell-line");
        expect(byAc?.pathParams?.some((p) => p.name === "ac" && p.required)).toBe(true);
        expect(search?.queryParams?.some((p) => p.name === "q")).toBe(true);
    });

    it("every endpoint accepts the format param with the json/xml/txt/tsv enum", () => {
        for (const e of cellosaurusCatalog.endpoints) {
            const format = e.queryParams?.find((p) => p.name === "format");
            expect(format, `format missing on ${e.path}`).toBeDefined();
            expect(format?.enum).toEqual(["json", "xml", "txt", "tsv"]);
        }
    });

    it("notes teach the envelope, staging, and field-selection conventions", () => {
        const notes = cellosaurusCatalog.notes ?? "";
        expect(notes).toMatch(/cell-line-list/);
        expect(notes).toMatch(/stage/i);
        expect(notes).toMatch(/fields=/);
    });
});
