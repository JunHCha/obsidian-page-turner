export const MAX_TAP_MOVEMENT = 10;
export const MAX_TAP_DURATION = 350;

export type TapZone = "left" | "middle" | "right";

export interface TapClassification {
  durationMs: number;
  movementPx: number;
  singlePointer: boolean;
  primaryButton: boolean;
  afterScroll: boolean;
  excludedTarget: boolean;
  hasTextSelection: boolean;
}

export function isPageTurnTap(tap: TapClassification): boolean {
  return tap.singlePointer
    && tap.primaryButton
    && tap.movementPx < MAX_TAP_MOVEMENT
    && tap.durationMs < MAX_TAP_DURATION
    && !tap.afterScroll
    && !tap.excludedTarget
    && !tap.hasTextSelection;
}

export function resolveTapZone(x: number, containerWidth: number, tapZoneWidth: number): TapZone {
  if (containerWidth <= 0) {
    return "middle";
  }

  const percentage = Math.min(45, Math.max(10, tapZoneWidth)) / 100;
  const normalizedX = Math.min(containerWidth, Math.max(0, x));

  if (normalizedX < containerWidth * percentage) {
    return "left";
  }
  if (normalizedX > containerWidth * (1 - percentage)) {
    return "right";
  }
  return "middle";
}

export function nearestPageIndex(scrollTop: number, pageOffsets: readonly number[]): number | null {
  if (pageOffsets.length === 0) {
    return null;
  }

  const firstOffset = pageOffsets[0];
  if (firstOffset === undefined) {
    return null;
  }

  let nearestIndex = 0;
  let nearestDistance = Math.abs(firstOffset - scrollTop);

  for (let index = 1; index < pageOffsets.length; index += 1) {
    const offset = pageOffsets[index];
    if (offset === undefined) {
      continue;
    }
    const distance = Math.abs(offset - scrollTop);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

export function shouldSnapPage(
  pageHeight: number,
  viewportHeight: number,
  tolerance = 0.05
): boolean {
  if (pageHeight <= 0 || viewportHeight <= 0 || tolerance < 0) {
    return false;
  }
  return pageHeight <= viewportHeight * (1 + tolerance);
}

export function clampPage(page: number, pagesCount: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pagesCount));
}
