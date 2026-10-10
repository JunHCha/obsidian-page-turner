import { Component } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { isPageTurnTap, nearestPageIndex, resolveTapZone, shouldSnapPage } from "./navigation";
import { getPdfFilePath, waitForPdfViewer } from "./pdfAdapter";
import type { PdfViewerHandle } from "./pdfAdapter";
import type { PageTurnerSettings } from "./settings";

interface PointerState {
  id: number;
  startX: number;
  startY: number;
  startedAt: number;
  multiplePointers: boolean;
  primaryButton: boolean;
}

const EXCLUDED_TARGETS = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  ".annotationLayer a",
  ".toolbar",
  ".pdf-toolbar",
  "[class*='pdf-toolbar']",
  ".pdf-sidebar",
  "[class*='pdf-sidebar']",
  ".sidebarContainer",
  ".thumbnailViewer",
  ".pdf-outline-view",
  ".pdf-thumbnail-view"
].join(",");

export class PdfController extends Component {
  public readonly attachedFilePath: string | null;
  private readonly abortController = new AbortController();
  private handle: PdfViewerHandle | null = null;
  private pointer: PointerState | null = null;
  private pointerDown = false;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private scrollTimer: number | null = null;
  private fitTimer: number | null = null;
  private programmaticScroll = false;
  private programmaticTimer: number | null = null;

  public constructor(
    private readonly leaf: WorkspaceLeaf,
    private readonly getSettings: () => Readonly<PageTurnerSettings>
  ) {
    super();
    this.attachedFilePath = getPdfFilePath(leaf);
  }

  public override onload(): void {
    void this.attach();
  }

  public override onunload(): void {
    this.abortController.abort();
    this.clearTimers();
    this.handle?.rootElement.classList.remove("page-turner-active");
  }

  public turnPage(delta: -1 | 1): boolean {
    const settings = this.getSettings();
    return settings.enabled && this.handle?.turnPage(delta) === true;
  }

  public refreshSettings(): void {
    const settings = this.getSettings();
    this.handle?.rootElement.classList.toggle("page-turner-active", settings.enabled);
    if (settings.enabled && settings.fitPageOnOpen) {
      this.scheduleFit();
    }
  }

  private async attach(): Promise<void> {
    const handle = await waitForPdfViewer(this.leaf, this.abortController.signal);
    if (handle === null || this.abortController.signal.aborted) {
      return;
    }

    this.handle = handle;
    this.refreshSettings();
    this.register(() => handle.rootElement.classList.remove("page-turner-active"));
    this.register(handle.onPagesInit(() => this.scheduleFit()));
    this.registerPointerEvents(handle);
    this.registerScrollEvents(handle);
    this.registerResize(handle);
  }

  private registerPointerEvents(handle: PdfViewerHandle): void {
    this.registerDomEvent(handle.rootElement, "pointerdown", (event) => {
      if (!event.isPrimary || this.pointer !== null) {
        if (this.pointer !== null) {
          this.pointer.multiplePointers = true;
        }
        return;
      }
      this.pointerDown = true;
      this.pointer = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: event.timeStamp,
        multiplePointers: false,
        primaryButton: event.button === 0
      };
    }, { capture: true });

    this.registerDomEvent(handle.rootElement, "pointercancel", (event) => {
      if (event.pointerId === this.pointer?.id) {
        this.pointer = null;
        this.pointerDown = false;
      }
    }, { capture: true });

    this.registerDomEvent(handle.rootElement, "pointerup", (event) => {
      const pointer = this.pointer;
      if (pointer === null || event.pointerId !== pointer.id) {
        return;
      }
      this.pointer = null;
      this.pointerDown = false;

      const settings = this.getSettings();
      if (!settings.enabled || !settings.tapToTurn) {
        return;
      }

      const movement = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
      const selection = handle.rootElement.ownerDocument.getSelection();
      const target = event.target;
      const excludedTarget = isElementTarget(target) && (
        target.closest(EXCLUDED_TARGETS) !== null
        || target.closest(".textLayer") !== null && selection?.isCollapsed === false
      );
      const isTap = isPageTurnTap({
        durationMs: event.timeStamp - pointer.startedAt,
        movementPx: movement,
        singlePointer: !pointer.multiplePointers && event.isPrimary,
        primaryButton: pointer.primaryButton,
        afterScroll: event.timeStamp - this.lastScrollAt < 200,
        excludedTarget,
        hasTextSelection: selection?.isCollapsed === false
      });

      if (!isTap) {
        return;
      }

      const bounds = handle.rootElement.getBoundingClientRect();
      const zone = resolveTapZone(event.clientX - bounds.left, bounds.width, settings.tapZoneWidth);
      const handled = zone === "left"
        ? handle.turnPage(-1)
        : zone === "right" && handle.turnPage(1);

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, { capture: true });
  }

  private registerScrollEvents(handle: PdfViewerHandle): void {
    this.registerDomEvent(handle.scrollElement, "scroll", () => {
      this.lastScrollAt = performance.now();
      if (this.programmaticScroll) {
        return;
      }
      this.scheduleSnap();
    }, { passive: true });

    const onScrollEnd = (): void => this.snapToNearestPage();
    handle.scrollElement.addEventListener("scrollend", onScrollEnd);
    this.register(() => handle.scrollElement.removeEventListener("scrollend", onScrollEnd));
  }

  private registerResize(handle: PdfViewerHandle): void {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => this.scheduleFit());
    observer.observe(handle.rootElement);
    this.register(() => observer.disconnect());
  }

  private scheduleSnap(): void {
    if (this.scrollTimer !== null) {
      window.clearTimeout(this.scrollTimer);
    }
    this.scrollTimer = window.setTimeout(() => {
      this.scrollTimer = null;
      this.snapToNearestPage();
    }, 150);
  }

  private snapToNearestPage(): void {
    const handle = this.handle;
    const settings = this.getSettings();
    if (handle === null || !settings.enabled || !settings.snapScroll || this.pointerDown || this.programmaticScroll) {
      return;
    }

    const index = nearestPageIndex(handle.getScrollTop(), handle.getPageOffsets());
    if (index === null) {
      return;
    }
    const pageHeight = handle.getPageHeights()[index];
    if (pageHeight === undefined || !shouldSnapPage(pageHeight, handle.getViewportHeight())) {
      return;
    }
    this.programmaticScroll = true;
    handle.scrollToPage(index);
    if (this.programmaticTimer !== null) {
      window.clearTimeout(this.programmaticTimer);
    }
    this.programmaticTimer = window.setTimeout(() => {
      this.programmaticScroll = false;
      this.programmaticTimer = null;
    }, 500);
  }

  private scheduleFit(): void {
    if (this.fitTimer !== null) {
      window.clearTimeout(this.fitTimer);
    }
    this.fitTimer = window.setTimeout(() => {
      this.fitTimer = null;
      const settings = this.getSettings();
      if (settings.enabled && settings.fitPageOnOpen) {
        this.handle?.fitPage();
      }
    }, 100);
  }

  private clearTimers(): void {
    if (this.scrollTimer !== null) {
      window.clearTimeout(this.scrollTimer);
    }
    if (this.fitTimer !== null) {
      window.clearTimeout(this.fitTimer);
    }
    if (this.programmaticTimer !== null) {
      window.clearTimeout(this.programmaticTimer);
    }
  }
}

function isElementTarget(target: EventTarget | null): target is Element {
  return target !== null
    && typeof (target as { closest?: unknown }).closest === "function";
}
