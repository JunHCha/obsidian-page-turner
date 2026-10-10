import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type PageTurnerPlugin from "./main";

export interface PageTurnerSettings {
  enabled: boolean;
  tapToTurn: boolean;
  tapZoneWidth: number;
  swipeToTurn: boolean;
  showTurnButtons: boolean;
  fitPageOnOpen: boolean;
  snapScroll: boolean;
  keyboardTurn: boolean;
}

export const DEFAULT_SETTINGS: PageTurnerSettings = {
  enabled: true,
  tapToTurn: true,
  tapZoneWidth: 33,
  swipeToTurn: true,
  showTurnButtons: true,
  fitPageOnOpen: true,
  snapScroll: true,
  keyboardTurn: true
};

export class PageTurnerSettingTab extends PluginSettingTab {
  public constructor(app: App, private readonly plugin: PageTurnerPlugin) {
    super(app, plugin);
  }

  public display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName("Page turning")
      .setHeading();

    new Setting(this.containerEl)
      .setName("Enable page turner")
      .setDesc("Enable or disable all page turning behavior.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enabled)
        .onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("Tap to turn pages")
      .setDesc("Tap the left or right edge of a PDF to turn one page.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.tapToTurn)
        .onChange(async (value) => {
          this.plugin.settings.tapToTurn = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("Tap zone width")
      .setDesc("Width of each page-turning edge as a percentage.")
      .addSlider((slider) => slider
        .setLimits(10, 45, 1)
        .setDynamicTooltip()
        .setValue(this.plugin.settings.tapZoneWidth)
        .onChange(async (value) => {
          this.plugin.settings.tapZoneWidth = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("Swipe to turn pages")
      .setDesc("Swipe left or right on a PDF page to turn it.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.swipeToTurn)
        .onChange(async (value) => {
          this.plugin.settings.swipeToTurn = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("Show page turn buttons")
      .setDesc("Show small previous and next buttons over the PDF as a fallback.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.showTurnButtons)
        .onChange(async (value) => {
          this.plugin.settings.showTurnButtons = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("Fit page to screen")
      .setDesc("Fit the whole PDF page when it opens or the viewer changes size.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.fitPageOnOpen)
        .onChange(async (value) => {
          this.plugin.settings.fitPageOnOpen = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("Snap scrolling to pages")
      .setDesc("Align the closest page after vertical scrolling stops.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.snapScroll)
        .onChange(async (value) => {
          this.plugin.settings.snapScroll = value;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("Turn pages with keys and pedals")
      .setDesc("Use navigation keys or a bluetooth page-turn pedal in the active PDF.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.keyboardTurn)
        .onChange(async (value) => {
          this.plugin.settings.keyboardTurn = value;
          await this.plugin.saveSettings();
        }));
  }
}
