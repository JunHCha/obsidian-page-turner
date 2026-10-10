import type { WorkspaceLeaf } from "obsidian";
import { clampPage } from "./navigation";

type EventCallback = () => void;

interface PdfEventBus {
  on?: (name: string, callback: EventCallback) => void;
  off?: (name: string, callback: EventCallback) => void;
}

interface PdfViewerInternal {
  currentPageNumber: number;
  pagesCount: number;
  currentScaleValue: string | number;
  container?: HTMLElement;
  viewer?: HTMLElement;
  eventBus?: PdfEventBus;
}

export interface PdfViewerHandle {
  readonly rootElement: HTMLElement;
  readonly scrollElement: HTMLElement;
  readonly viewerIdentity: object;
  fitPage(): void;
  turnPage(delta: -1 | 1): boolean;
  getPageOffsets(): number[];
  getPageHeights(): number[];
  getScrollTop(): number;
  getViewportHeight(): number;
  scrollToPage(index: number): void;
  onPagesInit(callback: EventCallback): () => void;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function property(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

function isPdfViewer(value: unknown): value is PdfViewerInternal {
  return isRecord(value)
    && typeof value.currentPageNumber === "number"
    && typeof value.pagesCount === "number";
}

function findInternalViewer(leaf: WorkspaceLeaf): PdfViewerInternal | null {
  if (leaf.view.getViewType() !== "pdf") {
    return null;
  }

  const view = leaf.view as unknown;
  const viewer = property(view, "viewer");
  const child = property(viewer, "child");
  const pdfViewer = property(child, "pdfViewer");
  const nestedPdfViewer = property(pdfViewer, "pdfViewer");

  if (isPdfViewer(nestedPdfViewer)) {
    return nestedPdfViewer;
  }
  return isPdfViewer(pdfViewer) ? pdfViewer : null;
}

function viewContainer(leaf: WorkspaceLeaf): HTMLElement | null {
  const container = property(leaf.view, "containerEl");
  return isElement(container) ? container : null;
}

export function getPdfFilePath(leaf: WorkspaceLeaf): string | null {
  try {
    const file = property(leaf.view, "file");
    const path = property(file, "path");
    return typeof path === "string" ? path : null;
  } catch {
    return null;
  }
}

function createHandle(leaf: WorkspaceLeaf, viewer: PdfViewerInternal): PdfViewerHandle | null {
  const rootElement = viewContainer(leaf);
  const scrollElement = isElement(viewer.container)
    ? viewer.container
    : rootElement?.querySelector<HTMLElement>(".pdfViewerContainer") ?? null;

  if (
    rootElement === null
    || scrollElement === null
    || !rootElement.isConnected
    || !scrollElement.isConnected
  ) {
    return null;
  }

  return {
    rootElement,
    scrollElement,
    viewerIdentity: viewer,
    fitPage(): void {
      try {
        viewer.currentScaleValue = "page-fit";
      } catch {
        // Obsidian's PDF viewer is internal and may change without notice.
      }
    },
    turnPage(delta: -1 | 1): boolean {
      try {
        if (viewer.pagesCount < 1) {
          return false;
        }
        const nextPage = clampPage(viewer.currentPageNumber + delta, viewer.pagesCount);
        if (nextPage === viewer.currentPageNumber) {
          return false;
        }
        viewer.currentPageNumber = nextPage;
        return true;
      } catch {
        return false;
      }
    },
    getPageOffsets(): number[] {
      try {
        return Array.from(scrollElement.querySelectorAll<HTMLElement>(".page"), (page) => page.offsetTop);
      } catch {
        return [];
      }
    },
    getPageHeights(): number[] {
      try {
        return Array.from(scrollElement.querySelectorAll<HTMLElement>(".page"), (page) => page.offsetHeight);
      } catch {
        return [];
      }
    },
    getScrollTop(): number {
      return scrollElement.scrollTop;
    },
    getViewportHeight(): number {
      return scrollElement.clientHeight;
    },
    scrollToPage(index: number): void {
      try {
        const pages = scrollElement.querySelectorAll<HTMLElement>(".page");
        const page = pages.item(index);
        if (page !== null) {
          scrollElement.scrollTo({ top: page.offsetTop, behavior: "smooth" });
        }
      } catch {
        // Smooth scrolling is optional when internals are unavailable.
      }
    },
    onPagesInit(callback: EventCallback): () => void {
      const eventBus = viewer.eventBus;
      if (typeof eventBus?.on !== "function") {
        return () => undefined;
      }
      try {
        eventBus.on("pagesinit", callback);
        return () => {
          try {
            eventBus.off?.("pagesinit", callback);
          } catch {
            // Cleanup must remain safe if the internal event bus changes.
          }
        };
      } catch {
        return () => undefined;
      }
    }
  };
}

export function getPdfViewer(leaf: WorkspaceLeaf): PdfViewerHandle | null {
  try {
    const viewer = findInternalViewer(leaf);
    return viewer === null ? null : createHandle(leaf, viewer);
  } catch {
    return null;
  }
}

export async function waitForPdfViewer(
  leaf: WorkspaceLeaf,
  signal: AbortSignal,
  timeoutMs = 5_000
): Promise<PdfViewerHandle | null> {
  const startedAt = Date.now();

  while (!signal.aborted && Date.now() - startedAt < timeoutMs) {
    const handle = getPdfViewer(leaf);
    if (handle !== null) {
      return await waitForPagesInit(handle, signal, Math.max(0, timeoutMs - (Date.now() - startedAt)));
    }
    await abortableDelay(100, signal);
  }
  return null;
}

async function waitForPagesInit(
  handle: PdfViewerHandle,
  signal: AbortSignal,
  timeoutMs: number
): Promise<PdfViewerHandle | null> {
  if (handle.getPageOffsets().length > 0) {
    return handle;
  }

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result: PdfViewerHandle | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      removePagesInit();
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => finish(null);
    const removePagesInit = handle.onPagesInit(() => finish(handle));
    const timeoutId = window.setTimeout(() => finish(handle), timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function abortableDelay(durationMs: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(resolve, durationMs);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
}
