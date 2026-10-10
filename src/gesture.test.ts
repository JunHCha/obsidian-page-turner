import { describe, expect, it } from "vitest";
import {
  classifyPageTurnSwipe,
  PointerGestureState
} from "./gesture";

describe("PointerGestureState", () => {
  it("discards stale state when a new primary pointer starts", () => {
    const gesture = new PointerGestureState();
    gesture.start({ id: 1, x: 10, y: 20, startedAt: 100, isPrimary: true, primaryButton: true });
    gesture.start({ id: 2, x: 30, y: 40, startedAt: 200, isPrimary: false, primaryButton: true });
    gesture.start({ id: 3, x: 50, y: 60, startedAt: 300, isPrimary: true, primaryButton: true });

    expect(gesture.terminate(3)).toMatchObject({
      id: 3,
      startX: 50,
      multiplePointers: false
    });
  });

  it("clears state when the active pointer terminates", () => {
    const gesture = new PointerGestureState();
    gesture.start({ id: 1, x: 10, y: 20, startedAt: 100, isPrimary: true, primaryButton: true });

    expect(gesture.isPointerDown).toBe(true);
    expect(gesture.terminate(1)).not.toBeNull();
    expect(gesture.isPointerDown).toBe(false);
    expect(gesture.terminate(1)).toBeNull();
  });
});

describe("classifyPageTurnSwipe", () => {
  const validSwipe = {
    dx: -80,
    dy: 10,
    durationMs: 300,
    singleTouch: true,
    excludedTarget: false,
    hasTextSelection: false,
    zoomedIn: false
  };

  it("maps left and right swipes to page directions", () => {
    expect(classifyPageTurnSwipe(validSwipe)).toBe(1);
    expect(classifyPageTurnSwipe({ ...validSwipe, dx: 80 })).toBe(-1);
  });

  it.each([
    ["too short", { dx: -59 }],
    ["too vertical", { dx: -60, dy: 41 }],
    ["too slow", { durationMs: 801 }],
    ["multiple touches", { singleTouch: false }],
    ["text selection", { hasTextSelection: true }],
    ["excluded target", { excludedTarget: true }],
    ["zoomed in", { zoomedIn: true }]
  ])("rejects a swipe that is %s", (_name, change) => {
    expect(classifyPageTurnSwipe({ ...validSwipe, ...change })).toBeNull();
  });
});
