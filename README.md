# Page Turner

[![CI](https://github.com/JunHCha/obsidian-page-turner/actions/workflows/ci.yml/badge.svg)](https://github.com/JunHCha/obsidian-page-turner/actions/workflows/ci.yml)

Turn PDFs in Obsidian with taps, pedals, and page-fit scrolling, like a sheet music viewer.

## Why

Obsidian's built-in PDF viewer scrolls continuously. That works well for reading, but it is awkward when playing from sheet music: performers need predictable, one-page-at-a-time navigation like a dedicated sheet music app. Page Turner adds that behavior while keeping PDFs inside Obsidian.

## Features

- **Tap to turn:** A short tap or click in the left or right edge of a PDF moves to the previous or next page. The middle zone keeps its default behavior, and page turns are suppressed during scrolling, dragging, pinch-zooming, long presses, text selection, link or annotation interaction, and use of the PDF toolbar or sidebar.
- **Swipe to turn:** Swipe left or right from a PDF page to turn it without opening Obsidian's mobile drawers. Swipes outside the page keep Obsidian's default behavior, and zoomed pages still pan normally.
- **On-screen controls:** Small previous and next buttons provide a reliable fallback for turning pages.
- **Focus mode:** Expand one PDF over the workspace and hide Obsidian's surrounding interface for distraction-free performance.
- **Fit page:** PDFs automatically use whole-page fit after their pages initialize and whenever the viewer is resized or the device rotates.
- **Scroll snap:** After vertical scrolling settles, the viewport smoothly aligns with the nearest page top when the whole page fits. Snapping pauses while zoomed in so you can scroll within a page.
- **Pedal and keyboard control:** Common navigation keys turn pages while a PDF is active and focus is outside editable controls. Bluetooth page-turn pedals that send these keys work too.

## Usage

With a PDF open, tap or click in one of these horizontal zones:

| Left zone | Middle zone | Right zone |
| --- | --- | --- |
| Previous page | Default PDF behavior | Next page |

The left and right zones each use the configured **Tap zone width**. The middle occupies the remaining area.

On a touch screen, swipe left for the next page or right for the previous page. Start the swipe on the PDF page itself; the surrounding margins remain available for Obsidian's drawer gestures.

When enabled, the translucent buttons in the bottom corners provide previous and next page controls. Use **Toggle focus mode** or the maximize action in the PDF header to show only the document; press `Escape`, run the command again, or use the top-right minimize button to exit.

Commands are available from the command palette and have no default hotkeys:

- **Next page**
- **Previous page**
- **Toggle page turner** — enables or disables all Page Turner behavior globally
- **Toggle focus mode** — enters or exits focus mode for the active PDF

Keyboard and pedal inputs work while the active view is a PDF and focus is not in an editable element:

| Action | Keys |
| --- | --- |
| Next page | `ArrowRight`, `ArrowDown`, `PageDown`, `Space` |
| Previous page | `ArrowLeft`, `ArrowUp`, `PageUp`, `Shift+Space` |

Tip: while performing, set your device's screen auto-sleep or auto-lock timeout long enough to keep the sheet music visible.

## Settings

| Name | Default | Description |
| --- | --- | --- |
| Enable page turner | `true` | Enables or disables all Page Turner behavior globally. |
| Tap to turn pages | `true` | Turns pages with short taps or clicks in the left and right zones. |
| Tap zone width | `33` | Sets the width of each side tap zone as a percentage, from 10% to 45%. |
| Swipe to turn pages | `true` | Turns pages with horizontal swipes that start on a PDF page. |
| Show page turn buttons | `true` | Shows small previous and next buttons over the PDF as a fallback. |
| Fit page to screen | `true` | Fits each PDF page to the screen when the PDF opens and when the viewer size changes. |
| Snap scrolling to pages | `true` | Smoothly aligns the viewport to the nearest page after vertical scrolling settles, unless the page is zoomed beyond the viewport. |
| Turn pages with keys and pedals | `true` | Enables page turns from supported keyboard keys and Bluetooth pedals. |

## Installation

### Community plugins

Once Page Turner is listed in the Obsidian Community plugins directory, search for **Page Turner**, select it, and choose **Install**, then **Enable**.

### BRAT

Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, choose **Add Beta plugin**, and enter:

```text
JunHCha/obsidian-page-turner
```

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from a release and copy them into:

```text
<vault>/.obsidian/plugins/page-turner/
```

Restart Obsidian, then enable **Page Turner** under Community plugins.

## Compatibility and limitations

Page Turner works on desktop and mobile, including iOS and Android, and requires Obsidian 1.5.0 or later.

The plugin relies on Obsidian's internal pdf.js viewer, which is not a public API. Obsidian updates may change that viewer and temporarily break Page Turner.

## Development

Node.js 20 and npm are required.

```sh
npm ci
npm run dev
npm run build
npm run lint
npm test
```

Contributions are welcome through pull requests. The `main` branch is protected, so submit changes on a branch and open a pull request.

## Releasing

Create a release branch from the latest `main`, then bump the version without creating a local commit or tag:

```sh
npm version <patch|minor|major> --no-git-tag-version
```

This updates `package.json`, `manifest.json`, and `versions.json`. Open a pull request with those changes and merge it after CI passes. Then update your local protected `main` branch and publish the version tag shown in `manifest.json`:

```sh
git tag <version>
git push origin <version>
```

The release workflow builds the plugin, verifies that the tag matches `manifest.json`, creates a GitHub release, and attaches `main.js`, `manifest.json`, and `styles.css`.

## License

[MIT](LICENSE)
