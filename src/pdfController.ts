import { Component, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { classifyPageTurnSwipe, PointerGestureState } from "./gesture";
import { isPageTurnTap, nearestPageIndex, resolveTapZone, shouldSnapPage } from "./navigation";
import { getPdfFilePath, getPdfViewer, waitForPdfViewer } from "./pdfAdapter";
import type { PdfViewerHandle } from "./pdfAdapter";
import type { PageTurnerSettings } from "./settings";

interface TouchState {
  id: number;
  startX: number;
  startY: number;
  startedAt: number;
  multipleTouches: boolean;
  excludedTarget: boolean;
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
  private bindings: Component | null = null;
  private controls: HTMLElement | null = null;
  private focusAction: HTMLElement | null = null;
  private focusMode = false;
  private focusElements: HTMLElement[] = [];
  private attaching = false;
  private unloading = false;
  private readonly pointer = new PointerGestureState();
  private touch: TouchState | null = null;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private scrollTimer: number | null = null;
  private fitTimer: number | null = null;
  private programmaticScroll = false;
  private programmaticTimer: number | null = null;

  public constructor(
    private readonly leaf: WorkspaceLeaf,
    private readonly getSettings: () => Readonly<PageTurnerSettings>,
    private readonly requestToggleFocus: () => void,
    private readonly requestExitFocus: () => void
  ) {
    super();
    this.attachedFilePath = getPdfFilePath(leaf);
  }

  public override onload(): void {
    this.registerFocusAction();
    void this.attach();
  }

  public override onunload(): void {
    this.unloading = true;
    this.abortController.abort();
    this.requestExitFocus();
    this.clearTimers();
    this.setFocusTarget(null);
    this.handle?.rootElement.classList.remove("page-turner-active");
  }

  public turnPage(delta: -1 | 1): boolean {
    if (this.unloading) {
      return false;
    }
    const settings = this.getSettings();
    const handle = this.ensureHandle();
    return settings.enabled && handle?.turnPage(delta) === true;
  }

  public refreshSettings(): void {
    if (this.unloading) {
      return;
    }
    this.ensureHandle();
    this.applySettings();
  }

  public revalidate(): void {
    if (this.unloading) {
      return;
    }
    this.ensureHandle();
  }

  public setFocusMode(active: boolean): void {
    if (this.unloading || this.abortController.signal.aborted) {
      if (!active) {
        this.setFocusTarget(null);
        this.controls?.classList.remove("page-turner-focus-exit-visible");
      }
      return;
    }
    this.focusMode = active;
    this.ensureHandle();
    this.applySettings();
    this.scheduleFit();
  }

  private applySettings(): void {
    const settings = this.getSettings();
    this.handle?.rootElement.classList.toggle("page-turner-active", settings.enabled);
    this.setFocusTarget(this.focusMode ? this.handle?.rootElement ?? null : null);
    this.controls?.classList.toggle(
      "page-turner-turn-controls-visible",
      settings.enabled && settings.showTurnButtons
    );
    this.controls?.classList.toggle("page-turner-focus-exit-visible", this.focusMode);
    if (settings.enabled && settings.fitPageOnOpen) {
      this.scheduleFit();
    }
  }

  private async attach(): Promise<void> {
    if (this.attaching || this.abortController.signal.aborted) {
      return;
    }
    this.attaching = true;
    try {
      const handle = await waitForPdfViewer(this.leaf, this.abortController.signal);
      if (handle !== null && !this.abortController.signal.aborted) {
        this.attachHandle(handle);
      }
    } finally {
      this.attaching = false;
    }
  }

  private attachHandle(handle: PdfViewerHandle): void {
    if (this.unloading || this.abortController.signal.aborted) {
      return;
    }
    if (
      this.handle?.rootElement === handle.rootElement
      && this.handle.scrollElement === handle.scrollElement
      && this.handle.viewerIdentity === handle.viewerIdentity
    ) {
      return;
    }
    this.detachHandle();
    this.handle = handle;
    const bindings = new Component();
    this.bindings = bindings;
    this.addChild(bindings);
    this.applySettings();
    bindings.register(() => handle.rootElement.classList.remove("page-turner-active"));
    bindings.register(handle.onPagesInit(() => this.scheduleFit()));
    this.createControls(bindings, handle);
    this.registerPointerEvents(bindings, handle);
    this.registerTouchEvents(bindings, handle);
    this.registerScrollEvents(bindings, handle);
    this.registerResize(bindings, handle);
  }

  private detachHandle(): void {
    this.setFocusTarget(null);
    this.handle?.rootElement.classList.remove("page-turner-active");
    if (this.bindings !== null) {
      this.removeChild(this.bindings);
      this.bindings = null;
    }
    this.handle = null;
    this.controls = null;
    this.resetGestures();
    this.clearTimers();
  }

  private registerFocusAction(): void {
    const view = this.leaf.view as unknown as {
      addAction?: (icon: "maximize", title: string, callback: (event: MouseEvent) => void) => HTMLElement;
    };
    if (typeof view.addAction !== "function") {
      return;
    }
    try {
      this.focusAction = view.addAction("maximize", "Focus mode", () => this.requestToggleFocus());
      this.register(() => {
        this.focusAction?.remove();
        this.focusAction = null;
      });
    } catch {
      this.focusAction = null;
    }
  }

  private createControls(bindings: Component, handle: PdfViewerHandle): void {
    const controls = handle.rootElement.createDiv({ cls: "page-turner-controls" });
    const previous = controls.createEl("button", {
      cls: ["page-turner-control", "page-turner-control-previous"]
    });
    previous.type = "button";
    previous.setAttribute("aria-label", "Previous page");
    setIcon(previous, "chevron-left");

    const next = controls.createEl("button", {
      cls: ["page-turner-control", "page-turner-control-next"]
    });
    next.type = "button";
    next.setAttribute("aria-label", "Next page");
    setIcon(next, "chevron-right");

    const exitFocus = controls.createEl("button", {
      cls: ["page-turner-control", "page-turner-control-exit-focus"]
    });
    exitFocus.type = "button";
    exitFocus.setAttribute("aria-label", "Exit focus mode");
    setIcon(exitFocus, "minimize");

    for (const button of [previous, next, exitFocus]) {
      bindings.registerDomEvent(button, "pointerdown", (event) => event.stopPropagation());
      bindings.registerDomEvent(button, "pointerup", (event) => event.stopPropagation());
      bindings.registerDomEvent(button, "touchstart", (event) => event.stopPropagation(), { passive: true });
      bindings.registerDomEvent(button, "touchmove", (event) => event.stopPropagation(), { passive: true });
      bindings.registerDomEvent(button, "touchend", (event) => event.stopPropagation(), { passive: true });
      bindings.registerDomEvent(button, "touchcancel", (event) => event.stopPropagation(), { passive: true });
    }
    const onPageTurn = (event: MouseEvent, delta: -1 | 1): void => {
      event.preventDefault();
      event.stopPropagation();
      this.turnPage(delta);
    };
    bindings.registerDomEvent(previous, "click", (event) => onPageTurn(event, -1));
    bindings.registerDomEvent(next, "click", (event) => onPageTurn(event, 1));
    bindings.registerDomEvent(exitFocus, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.requestExitFocus();
    });
    bindings.register(() => {
      controls.remove();
      if (this.controls === controls) {
        this.controls = null;
      }
    });
    this.controls = controls;
    this.applySettings();
  }

  private ensureHandle(): PdfViewerHandle | null {
    if (this.unloading || this.abortController.signal.aborted) {
      return null;
    }
    const resolved = getPdfViewer(this.leaf);
    if (resolved !== null && resolved.rootElement.isConnected && resolved.scrollElement.isConnected) {
      this.attachHandle(resolved);
      return this.handle;
    }
    if (this.handle?.rootElement.isConnected === true && this.handle.scrollElement.isConnected) {
      return this.handle;
    }
    this.detachHandle();
    void this.attach();
    return null;
  }

  private registerPointerEvents(bindings: Component, handle: PdfViewerHandle): void {
    const ownerWindow = handle.rootElement.ownerDocument.defaultView;
    if (ownerWindow === null) {
      return;
    }
    bindings.registerDomEvent(handle.rootElement, "pointerdown", (event) => {
      this.pointer.start({
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startedAt: event.timeStamp,
        isPrimary: event.isPrimary,
        primaryButton: event.button === 0
      });
    }, { capture: true });

    bindings.registerDomEvent(ownerWindow, "pointercancel", (event) => {
      this.pointer.terminate(event.pointerId);
    }, { capture: true });

    bindings.registerDomEvent(ownerWindow, "lostpointercapture", (event) => {
      this.pointer.terminate(event.pointerId);
    }, { capture: true });

    bindings.registerDomEvent(ownerWindow, "pointerup", (event) => {
      const pointer = this.pointer.terminate(event.pointerId);
      if (pointer === null || !isTargetInside(handle.rootElement, event.target)) {
        return;
      }

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

    bindings.registerDomEvent(ownerWindow, "blur", () => this.resetGestures(), { capture: true });
    bindings.registerDomEvent(handle.rootElement.ownerDocument, "visibilitychange", () => {
      if (handle.rootElement.ownerDocument.hidden) {
        this.resetGestures();
      }
    }, { capture: true });
  }

  private registerTouchEvents(bindings: Component, handle: PdfViewerHandle): void {
    bindings.registerDomEvent(handle.rootElement, "touchstart", (event) => {
      if (event.touches.length !== 1) {
        if (this.touch !== null) {
          this.touch.multipleTouches = true;
        }
        return;
      }
      const touch = event.touches.item(0);
      const target = event.target;
      const settings = this.getSettings();
      const page = isElementTarget(target) ? target.closest(".page") : null;
      if (
        touch === null
        || !settings.enabled
        || !settings.swipeToTurn
        || page === null
        || !handle.scrollElement.contains(page)
      ) {
        this.touch = null;
        return;
      }
      this.touch = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: event.timeStamp,
        multipleTouches: false,
        excludedTarget: isExcludedTarget(target)
      };
      event.stopPropagation();
    }, { passive: true });

    bindings.registerDomEvent(handle.rootElement, "touchmove", (event) => {
      const touch = this.touch;
      if (touch === null) {
        return;
      }
      if (event.touches.length !== 1) {
        touch.multipleTouches = true;
        return;
      }
      if (findTouch(event.touches, touch.id) !== null) {
        event.stopPropagation();
      }
    }, { passive: true });

    bindings.registerDomEvent(handle.rootElement, "touchcancel", () => {
      this.touch = null;
    }, { passive: true });

    bindings.registerDomEvent(handle.rootElement, "touchend", (event) => {
      const state = this.touch;
      if (state === null) {
        return;
      }
      const touch = findTouch(event.changedTouches, state.id);
      if (touch === null) {
        state.multipleTouches = true;
        return;
      }
      this.touch = null;
      const settings = this.getSettings();
      const selection = handle.rootElement.ownerDocument.getSelection();
      const direction = classifyPageTurnSwipe({
        dx: touch.clientX - state.startX,
        dy: touch.clientY - state.startY,
        durationMs: event.timeStamp - state.startedAt,
        singleTouch: !state.multipleTouches && event.touches.length === 0,
        excludedTarget: state.excludedTarget || isExcludedTarget(event.target),
        hasTextSelection: selection?.isCollapsed === false,
        zoomedIn: handle.scrollElement.scrollWidth > handle.scrollElement.clientWidth + 1
      });
      if (
        settings.enabled
        && settings.swipeToTurn
        && direction !== null
        && this.handle === handle
        && handle.turnPage(direction)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  private registerScrollEvents(bindings: Component, handle: PdfViewerHandle): void {
    bindings.registerDomEvent(handle.scrollElement, "scroll", () => {
      this.lastScrollAt = performance.now();
      if (this.programmaticScroll) {
        return;
      }
      this.scheduleSnap();
    }, { passive: true });

    const onScrollEnd = (): void => this.snapToNearestPage();
    handle.scrollElement.addEventListener("scrollend", onScrollEnd);
    bindings.register(() => handle.scrollElement.removeEventListener("scrollend", onScrollEnd));
  }

  private registerResize(bindings: Component, handle: PdfViewerHandle): void {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => this.scheduleFit());
    observer.observe(handle.rootElement);
    bindings.register(() => observer.disconnect());
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
    if (handle === null || !settings.enabled || !settings.snapScroll || this.pointer.isPointerDown || this.programmaticScroll) {
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
    this.scrollTimer = null;
    this.fitTimer = null;
    this.programmaticTimer = null;
    this.programmaticScroll = false;
  }

  private setFocusTarget(root: HTMLElement | null): void {
    if (this.focusElements[0] === root) {
      return;
    }
    for (const element of this.focusElements) {
      element.classList.remove("page-turner-focus-leaf", "page-turner-focus-ancestor");
    }
    this.focusElements = [];
    if (root === null) {
      return;
    }
    root.classList.add("page-turner-focus-leaf");
    this.focusElements.push(root);
    const body = root.ownerDocument.body;
    for (let element = root.parentElement; element !== null && element !== body; element = element.parentElement) {
      element.classList.add("page-turner-focus-ancestor");
      this.focusElements.push(element);
    }
  }

  private resetGestures(): void {
    this.pointer.reset();
    this.touch = null;
  }
}

function isElementTarget(target: EventTarget | null): target is Element {
  return target !== null
    && typeof (target as { closest?: unknown }).closest === "function";
}

function isTargetInside(element: HTMLElement, target: EventTarget | null): boolean {
  const nodeConstructor = element.ownerDocument.defaultView?.Node;
  return nodeConstructor !== undefined
    && target instanceof nodeConstructor
    && element.contains(target);
}

function isExcludedTarget(target: EventTarget | null): boolean {
  return isElementTarget(target) && target.closest(EXCLUDED_TARGETS) !== null;
}

function findTouch(touches: TouchList, identifier: number): Touch | null {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index);
    if (touch?.identifier === identifier) {
      return touch;
    }
  }
  return null;
}
