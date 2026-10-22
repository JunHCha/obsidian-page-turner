import { Plugin } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { PdfController } from "./pdfController";
import { getPdfFilePath, getPdfViewer } from "./pdfAdapter";
import {
  DEFAULT_SETTINGS,
  PageTurnerSettingTab
} from "./settings";
import type { PageTurnerSettings } from "./settings";

export default class PageTurnerPlugin extends Plugin {
  public override settings: PageTurnerSettings = { ...DEFAULT_SETTINGS };
  private readonly controllers = new Map<WorkspaceLeaf, PdfController>();
  private focusedLeaf: WorkspaceLeaf | null = null;
  private syncTimer: number | null = null;

  public override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new PageTurnerSettingTab(this.app, this));

    this.addCommand({
      id: "next-page",
      name: "Next page",
      callback: () => this.turnActivePage(1)
    });
    this.addCommand({
      id: "previous-page",
      name: "Previous page",
      callback: () => this.turnActivePage(-1)
    });
    this.addCommand({
      id: "toggle-page-turner",
      name: "Toggle page turner",
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
      }
    });
    this.addCommand({
      id: "toggle-focus-mode",
      name: "Toggle focus mode",
      callback: () => this.toggleActiveFocusMode()
    });

    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleSync()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleSync()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleSync()));
    this.registerDomEvent(document, "keydown", (event) => this.handleKeydown(event), { capture: true });
    this.scheduleSync();
  }

  public override onunload(): void {
    this.exitFocusMode();
    document.body.classList.remove("page-turner-focus");
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
    }
    for (const controller of this.controllers.values()) {
      this.removeChild(controller);
    }
    this.controllers.clear();
  }

  public async saveSettings(): Promise<void> {
    if (!this.settings.enabled) {
      this.exitFocusMode();
    }
    await this.saveData(this.settings);
    for (const controller of this.controllers.values()) {
      controller.refreshSettings();
    }
  }

  private async loadSettings(): Promise<void> {
    const saved = await this.loadData() as Partial<PageTurnerSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    this.settings.tapZoneWidth = Math.min(45, Math.max(10, this.settings.tapZoneWidth));
  }

  private scheduleSync(): void {
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
    }
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      this.syncControllers();
    }, 0);
  }

  private syncControllers(): void {
    const pdfLeaves = new Set(this.app.workspace.getLeavesOfType("pdf"));
    for (const [leaf, controller] of this.controllers) {
      if (!pdfLeaves.has(leaf)) {
        if (this.focusedLeaf === leaf) {
          this.exitFocusMode();
        }
        this.removeChild(controller);
        this.controllers.delete(leaf);
      }
    }
    for (const leaf of pdfLeaves) {
      const existingController = this.controllers.get(leaf);
      if (existingController?.attachedFilePath === getPdfFilePath(leaf)) {
        existingController.revalidate();
        continue;
      }
      if (existingController !== undefined) {
        if (this.focusedLeaf === leaf) {
          this.exitFocusMode();
        }
        this.removeChild(existingController);
      }
      const controller = new PdfController(
        leaf,
        () => this.settings,
        () => this.toggleFocusModeForLeaf(leaf),
        () => this.exitFocusModeForLeaf(leaf)
      );
      this.controllers.set(leaf, controller);
      this.addChild(controller);
    }
  }

  private turnActivePage(delta: -1 | 1): boolean {
    if (!this.settings.enabled) {
      return false;
    }
    // The PDF view has no public view class, so its active leaf must be checked directly.
    const leaf = this.app.workspace.activeLeaf;
    if (leaf === null || leaf.view.getViewType() !== "pdf") {
      return false;
    }
    return this.controllers.get(leaf)?.turnPage(delta) ?? getPdfViewer(leaf)?.turnPage(delta) ?? false;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.focusedLeaf !== null && !hasVisibleModal(document)) {
      this.exitFocusMode();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      !this.settings.enabled
      || !this.settings.keyboardTurn
      || event.defaultPrevented
      || event.repeat
      || event.ctrlKey
      || event.metaKey
      || event.altKey
    ) {
      return;
    }
    if (hasVisibleModal(document) || isEditableTarget(event.target)) {
      return;
    }

    const delta = keyDirection(event);
    if (delta !== null && this.turnActivePage(delta)) {
      event.preventDefault();
    }
  }

  private toggleActiveFocusMode(): void {
    const leaf = this.app.workspace.activeLeaf;
    if (leaf !== null && leaf.view.getViewType() === "pdf") {
      this.toggleFocusModeForLeaf(leaf);
    }
  }

  private toggleFocusModeForLeaf(leaf: WorkspaceLeaf): void {
    if (!this.settings.enabled) {
      return;
    }
    if (this.focusedLeaf === leaf) {
      this.exitFocusMode();
      return;
    }
    this.exitFocusMode();
    const controller = this.controllers.get(leaf);
    if (controller === undefined) {
      return;
    }
    this.focusedLeaf = leaf;
    document.body.classList.add("page-turner-focus");
    controller.setFocusMode(true);
  }

  private exitFocusModeForLeaf(leaf: WorkspaceLeaf): void {
    if (this.focusedLeaf === leaf) {
      this.exitFocusMode();
    }
  }

  private exitFocusMode(): void {
    const focusedLeaf = this.focusedLeaf;
    this.focusedLeaf = null;
    document.body.classList.remove("page-turner-focus");
    if (focusedLeaf !== null) {
      this.controllers.get(focusedLeaf)?.setFocusMode(false);
    }
  }
}

function keyDirection(event: KeyboardEvent): -1 | 1 | null {
  if (event.key === " " && event.shiftKey) {
    return -1;
  }
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
    return -1;
  }
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
    return 1;
  }
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function hasVisibleModal(ownerDocument: Document): boolean {
  return Array.from(ownerDocument.body.querySelectorAll<HTMLElement>(".modal-container"))
    .some((modal) => {
      if (modal.hidden || modal.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = modal.ownerDocument.defaultView?.getComputedStyle(modal);
      return style?.display !== "none" && style?.visibility !== "hidden";
    });
}
