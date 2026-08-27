import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { installMatchMediaStub } from "./helpers/router-provider";

installMatchMediaStub();

// jsdom does not implement ResizeObserver; assistant-ui's thread viewport needs it.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
// jsdom does not implement Element.scrollTo; assistant-ui's autoScroll needs it.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollTo(): void {};
}

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
