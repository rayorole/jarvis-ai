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
if (typeof window !== "undefined" && typeof window.scrollTo !== "function") {
  // jsdom's window.scrollTo is "not implemented"; tanstack router calls it on navigation.
  window.scrollTo = function scrollTo(): void {};
}
// jsdom lacks PointerEvent capture APIs; Radix Select/Popover need them to open.
if (typeof Element !== "undefined" && typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
    return false;
  };
}
if (typeof Element !== "undefined" && typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
}
if (typeof Element !== "undefined" && typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
