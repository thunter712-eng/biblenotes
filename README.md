# Bible Notes

A free study Bible for iPad that you write in with Apple Pencil. Read Scripture on one side and take handwritten notes on a lined page on the other. It installs from the browser, works in airplane mode, and keeps everything on your device.

**App:** https://thunter712-eng.github.io/biblenotes/

## Install on your iPad

1. Open the link above in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open Bible Notes from the Home Screen once while online. After that it works with no connection.

Install it rather than using it in a Safari tab. Safari can clear data for websites you haven't visited lately, and that could include your notes. Home Screen apps are protected from that.

## Back up your notes

Your notes exist only on this iPad, and there is no account or cloud copy. Go to **Settings → Back up now** and save the file somewhere safe, such as iCloud Drive. Settings shows when you last backed up, and the app reminds you when a backup is overdue (every two weeks unless you change it).

To restore, use **Settings → Restore from a backup** and choose one of these:

- **Merge** keeps everything on the device and adds what's new. If an item exists on both sides, the most recently edited one wins. Items you deleted after making the backup come back.
- **Replace** erases the device first and makes it match the backup exactly. This can't be undone.

## How it works

| To do this | Do this |
| --- | --- |
| Select a verse | Tap it. Tap another to extend to a range. Tap a selected verse to remove it. |
| Select non-contiguous verses | Turn on **Pick separately**, or tap inside a range to remove verses |
| Select by dragging | Drag with the Pencil, or press and hold with a finger, then drag |
| Highlight part of a verse | Select one verse, tap **Words**, drag across them, pick a color |
| Put a verse on your page | Tap **Add to page**, or press a selected verse and drag it over. **Copy** then the paste button also works. |
| Write | The Pencil draws. One finger pans, two fingers pinch and pan. |
| Change tool size and options | Tap the active tool again |
| Draw a straight line, oval or box | Hold still at the end of a stroke |
| Move ink | Lasso it, then drag the selection or its corner handles |
| Move or resize a text box | Tap it with the Text tool, then use the blue handles. The lasso also works and scales the text. |

## Run it locally

Needs Node 24.

```sh
npm ci
npm run dev           # http://localhost:5173/biblenotes/
npm test              # unit tests
npx playwright install webkit chromium
npm run test:e2e      # end-to-end tests
npm run build
```

To test on your iPad, run `npx vite --host` and open your Mac's address. Plain http has no service worker and limits some APIs, so use the deployed site to check offline behavior and installing.

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` runs the unit tests, builds and deploys on every push to `main`.

One setup step, once per repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then re-run the workflow.

The base path comes from the repository name, so a fork or rename keeps working. It uses hash routes (`#/read/JHN/3`), so deep links need no server rewrites.

## Translations and licenses

| Translation | Status | Source |
| --- | --- | --- |
| World English Bible (WEB), 2020 stable text | Public domain ([statement](https://ebible.org/engwebp/copyright.htm)). "World English Bible" is a trademark of eBible.org, and the name can't be used for a changed text. | [eBible.org USFM](https://ebible.org/Scriptures/engwebp_usfm.zip) |
| American Standard Version (ASV), 1901 | Public domain ([statement](https://ebible.org/eng-asv/copyright.htm)) | [eBible.org USFM](https://ebible.org/Scriptures/eng-asv_usfm.zip) |

I chose eBible.org because it is the master publisher of the WEB, and using one source means one pipeline for both translations. Both license statements were read from eBible.org's pages for this project. The About page in the app carries the attribution.

`scripts/build-bible.ts` turns the USFM into compact per-book JSON in `public/bible/`, which is committed so the app never needs the network for Scripture. It removes footnotes, cross references, Strong's numbers and formatting markup such as words of Jesus and supplied-word italics. The wording is untouched.

`npm run verify:bible` proves that by comparing the output with eBible's separately published verse-per-line edition. The current result is **0 differences across all 31,103 WEB and 31,102 ASV verses**. A few verse numbers are intentionally empty, such as Luke 17:36, because the source translations omit those verses.

### Add a translation

1. Verify that its license allows this. NIV, ESV, NLT, NASB and similar are copyrighted and must not be added.
2. Add an entry to `scripts/translations.config.ts`.
3. Run `npm run build:bible && npm run verify:bible`, then commit `public/bible`.

The app discovers translations from the generated `index.json`. The KJV has a [crown copyright in the UK](https://en.wikipedia.org/wiki/King_James_Version#Copyright_status), so check that it suits your use.

## What a browser can't do

Being honest about this matters more than faking it.

- **Apple Pencil double-tap and squeeze** aren't exposed to web pages, so tool switching goes through the toolbar.
- **Scribble and Apple's handwriting recognition** aren't available on the canvas, which turns Scribble off so it can't interfere. Handwriting is not searchable. Typed text is. Each page keeps a searchable `text` field, so OCR results could be added there later.
- **Pencil hover** isn't used for previews. Where Safari reports hover it only helps palm rejection.
- **Latency.** Safari ignores the `desynchronized` canvas hint, so there is no low-latency path around the browser compositor. The engine keeps per-frame work very small to compensate, but it can't match the Metal-backed PencilKit used by native apps like GoodNotes.
- **Predicted and coalesced events** vary by iPadOS version. They're used when present. The ink test page shows what your iPad provides.
- **The keyboard can't open by itself.** After **Typed note**, the cursor is in place, but iOS needs one more tap on the note to raise the keyboard.
- **Storage is local.** Even installed, deleting the app deletes the notes. Keep backups.

Other tradeoffs:

- **Undo history lasts for the session.** It's unlimited and per page, and it survives switching pages, but it's gone once the app closes.
- **The Pencil doesn't scroll the reader**, because its drags select verses. Use a finger to scroll.
- **PDFs are images at 240 dpi.** They match the screen exactly, including blended highlighter, but the text can't be selected.
- **A page's size is fixed at Letter proportions** and grows downward by whole sheets.
- **The pixel eraser cuts strokes rather than bitmaps.** It stays sharp and undoable, but its edges are round rather than exactly eraser-shaped.

## Architecture

See [PLAN.md](PLAN.md) for the reasoning.

- `src/ink/` is the framework-free ink engine. Pointer events go straight to a live canvas and never pass through React.
- Layers, bottom to top: paper, DOM objects, highlighter (blended), committed ink, live stroke.
- Each stroke is one IndexedDB row of delta-encoded varints, so autosave writes only what changed.
- `src/db/schema.ts` holds the versioned schema. Migrations are additive and tested.

### Measured performance

From the automated tests in headless WebKit on an Apple Silicon Mac. **These are not iPad numbers.** Use **Settings → Ink test page** on the device to get real ones.

| Measure | Result | Budget |
| --- | --- | --- |
| Live stroke work per frame, 5,000 strokes on the page | under 1 ms | 16.7 ms |
| Committing a stroke, 5,000 strokes on the page | about 1 ms | 16.7 ms |
| Full repaint, 5,000 strokes | 13 to 36 ms (first paint 45 to 71 ms) | Runs only after a gesture |
| Live frame and commit, one 3,000-point stroke | about 1 ms each | 16.7 ms |

WebKit's timer resolves to 1 ms, so sub-millisecond readings are approximate. Lighthouse scores are in [TESTING.md](TESTING.md). The first load precaches about 10 MB, nearly all of it Bible text and fonts.

## Dependencies

| Package | License | Purpose |
| --- | --- | --- |
| react, react-dom | MIT | UI |
| zustand | MIT | UI state |
| dexie, dexie-react-hooks | Apache-2.0 | IndexedDB |
| perfect-freehand | MIT | Pressure-sensitive stroke outlines |
| @tiptap/* (ProseMirror) | MIT | Rich text |
| fflate | MIT | Backup zips |
| @fontsource/* (EB Garamond, Lora, Merriweather, Source Serif 4, Inter, Alegreya Sans, Caveat, Patrick Hand, JetBrains Mono) | SIL OFL 1.1 | Self-hosted fonts |

Development only: vite and vite-plugin-pwa, @vitejs/plugin-react, workbox (MIT), vitest (MIT), @types/* (MIT), typescript, @playwright/test and fake-indexeddb (Apache-2.0).

I replaced the suggested approach of a PDF library with a small built-in writer (`src/backup/pdf.ts`), because pdf-lib hasn't had a release in years and only image pages are needed. The app icon is original artwork, drawn for this project.
