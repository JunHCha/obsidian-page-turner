export const MIN_SWIPE_DISTANCE = 60;
export const MAX_SWIPE_DURATION = 800;
export const SWIPE_HORIZONTAL_RATIO = 1.5;

export interface PointerGestureStart {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  isPrimary: boolean;
  primaryButton: boolean;
}

export interface PointerGestureSnapshot {
  id: number;
  startX: number;
  startY: number;
  startedAt: number;
  multiplePointers: boolean;
  primaryButton: boolean;
}

export class PointerGestureState {
  private pointer: PointerGestureSnapshot | null = null;

  public get isPointerDown(): boolean {
    return this.pointer !== null;
  }

  public start(input: PointerGestureStart): void {
    if (input.isPrimary) {
      this.pointer = {
        id: input.id,
        startX: input.x,
        startY: input.y,
        startedAt: input.startedAt,
        multiplePointers: false,
        primaryButton: input.primaryButton
      };
      return;
    }
    if (this.pointer !== null) {
      this.pointer.multiplePointers = true;
    }
  }

  public terminate(pointerId: number): PointerGestureSnapshot | null {
    if (this.pointer?.id !== pointerId) {
      return null;
    }
    const pointer = this.pointer;
    this.pointer = null;
    return pointer;
  }

  public reset(): void {
    this.pointer = null;
  }
}

export interface SwipeClassification {
  dx: number;
  dy: number;
  durationMs: number;
  singleTouch: boolean;
  excludedTarget: boolean;
  hasTextSelection: boolean;
  zoomedIn: boolean;
}

export function classifyPageTurnSwipe(swipe: SwipeClassification): -1 | 1 | null {
  const horizontalDistance = Math.abs(swipe.dx);
  if (
    !swipe.singleTouch
    || swipe.excludedTarget
    || swipe.hasTextSelection
    || swipe.zoomedIn
    || swipe.durationMs > MAX_SWIPE_DURATION
    || horizontalDistance < MIN_SWIPE_DISTANCE
    || horizontalDistance < SWIPE_HORIZONTAL_RATIO * Math.abs(swipe.dy)
  ) {
    return null;
  }
  return swipe.dx < 0 ? 1 : -1;
}
