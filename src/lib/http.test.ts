import {afterEach, expect, it, vi} from "vitest";
import {cellosaurusFetch} from "./http";
afterEach(() => vi.unstubAllGlobals());

it("honors the shared context deadline when a body read and cancellation both stall", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const reading = new Promise<void>(resolve => {started = resolve;});
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
    pull() {started(); return new Promise(() => {});}, cancel: () => new Promise(() => {}),
  }), {headers: {"content-type": "application/json"}})));
  const rejected = expect(cellosaurusFetch("/release-info", {}, controller.signal)).rejects.toMatchObject({status: 502, message: "Cellosaurus request timed out"});
  await reading; controller.abort(); await rejected;
});

it("returns HTTP failures without waiting for cancellation and refuses redirects", async () => {
  const fetcher = vi.fn(async () => new Response(new ReadableStream({cancel: () => new Promise(() => {})}), {status: 302, headers: {Location: "https://other.test"}}));
  vi.stubGlobal("fetch", fetcher);
  await expect(cellosaurusFetch("/release-info")).rejects.toMatchObject({status: 302});
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects malformed UTF-8 and a deadline already exceeded before fetch", async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array([0xc3, 0x28]), {headers: {"content-type": "application/json"}}));
  vi.stubGlobal("fetch", fetcher);
  await expect(cellosaurusFetch("/release-info")).rejects.toThrow("Invalid Cellosaurus UTF-8");
  const controller = new AbortController(); controller.abort();
  await expect(cellosaurusFetch("/release-info", {}, controller.signal)).rejects.toThrow("timed out");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
