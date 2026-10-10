import { describe, expect, it } from "vitest";
import {
  clampPage,
  isPageTurnTap,
  nearestPageIndex,
  resolveTapZone,
  shouldSnapPage
} from "./navigation";

describe("isPageTurnTap", () => {
  const validTap = {
    durationMs: 120,
    movementPx: 3,
    singlePointer: true,
    primaryButton: true,
    afterScroll: false,
    excludedTarget: false,
    hasTextSelection: false
  };

  it("accepts a short, still, single-pointer tap", () => {
    expect(isPageTurnTap(validTap)).toBe(true);
  });

  it.each([
    ["drag", { movementPx: 10 }],
    ["long press", { durationMs: 350 }],
    ["multiple pointers", { singlePointer: false }],
    ["non-primary button", { primaryButton: false }],
    ["recent scroll", { afterScroll: true }],
    ["excluded target", { excludedTarget: true }],
    ["selection", { hasTextSelection: true }]
  ])("rejects a %s", (_name, change) => {
    expect(isPageTurnTap({ ...validTap, ...change })).toBe(false);
  });
});

describe("resolveTapZone", () => {
  it("resolves left, middle, and right zones", () => {
    expect(resolveTapZone(20, 100, 33)).toBe("left");
    expect(resolveTapZone(50, 100, 33)).toBe("middle");
    expect(resolveTapZone(80, 100, 33)).toBe("right");
  });

  it("clamps the configured percentage", () => {
    expect(resolveTapZone(9, 100, 5)).toBe("left");
    expect(resolveTapZone(44, 100, 90)).toBe("left");
    expect(resolveTapZone(50, 0, 33)).toBe("middle");
  });
});

describe("nearestPageIndex", () => {
  it("returns the nearest page top", () => {
    expect(nearestPageIndex(480, [0, 500, 1000])).toBe(1);
    expect(nearestPageIndex(760, [0, 500, 1000])).toBe(2);
  });

  it("handles empty page lists", () => {
    expect(nearestPageIndex(0, [])).toBeNull();
  });
});

describe("shouldSnapPage", () => {
  it("snaps pages that fit within the viewport tolerance", () => {
    expect(shouldSnapPage(1_000, 1_000)).toBe(true);
    expect(shouldSnapPage(1_050, 1_000)).toBe(true);
  });

  it("does not trap scrolling inside a zoomed page", () => {
    expect(shouldSnapPage(1_051, 1_000)).toBe(false);
    expect(shouldSnapPage(1_500, 1_000)).toBe(false);
  });

  it("rejects unavailable dimensions", () => {
    expect(shouldSnapPage(0, 1_000)).toBe(false);
    expect(shouldSnapPage(1_000, 0)).toBe(false);
  });
});

describe("clampPage", () => {
  it("keeps navigation within the document", () => {
    expect(clampPage(0, 8)).toBe(1);
    expect(clampPage(5, 8)).toBe(5);
    expect(clampPage(9, 8)).toBe(8);
  });
});
