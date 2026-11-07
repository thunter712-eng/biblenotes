# Bible Notes plan

An offline-first PWA for reading the Bible and taking Apple Pencil notes on iPad. Static files on GitHub Pages, all data in IndexedDB, no accounts or servers.

## Architecture

```
src/bible/     Book table, reference parser, verse ids, data loader, full-text search
src/db/        Dexie schema, versioned migrations, repositories
src/ink/       Framework-free ink engine (no React): input, gestures, tools, render layers, history
src/notebook/  React shell around the engine: panel, toolbar, text boxes, verse quotes, templates
src/reader/    Reading view, verse selection, highlights, inline notes, parallel view
src/editor/    Tiptap rich text editor and font set
src/library/   Notebooks, notes index, search across notes
src/backup/    Backup and restore, PDF and PNG export
scripts/       build-bible.ts (data pipeline), build-icons.ts
public/bible/  Generated per-book JSON, committed to the repo
```

Key decisions:

- **Hash routing.** GitHub Pages cannot rewrite paths, and hash routes make deep links work without a 404.html trick.
- **Ink engine outside React.** Pointer handling and rendering never pass through a React render. React only hosts the engine and draws the non-ink objects.
- **Layered canvases.** paper, DOM objects, highlighter (multiply blended), committed ink, then a live canvas redrawn each frame. Committed layers are cached with overscan and moved by CSS transform during gestures, then re-rendered when the gesture ends.
- **One row per page object.** Each stroke is its own IndexedDB row, so autosave writes only what changed. Rewriting a 5,000-stroke page on every stroke would stall the pen.
- **Compact strokes.** Points are delta-encoded varints in a `Uint8Array`. Canvas bitmaps are never the source of truth.
- **Pixel eraser is vector.** It splits strokes rather than punching holes in a bitmap, so undo, export and zoom stay sharp.
- **Verse ids are USFM refs** (`JHN.3.16`). Notes anchor to verses and survive translation switches. Word-range highlights also record their translation, because word positions differ between translations.
- **PDF export is rasterised.** A small built-in writer embeds high-resolution JPEG pages. It is pixel-faithful, including blended highlighter, and avoids depending on pdf-lib, which is no longer maintained. The tradeoff is that exported text is not selectable.

## Bible data

| Translation | Source | Status | Why this source |
| --- | --- | --- | --- |
| World English Bible (`engwebp`) | `https://ebible.org/Scriptures/engwebp_usfm.zip` | Public domain, checked at `https://ebible.org/engwebp/copyright.htm`. "World English Bible" is a trademark of eBible.org: the name may not be used for a changed text. | eBible.org is the master publisher of the WEB. |
| American Standard Version 1901 (`eng-asv`) | `https://ebible.org/Scriptures/eng-asv_usfm.zip` | Public domain, checked at `https://ebible.org/eng-asv/copyright.htm` | Same format and pipeline as the WEB. |

The pipeline removes footnotes, cross references and Strong's tags. Those are formatting and apparatus, not wording changes. Adding KJV or BSB means one new entry in `scripts/translations.config.ts` plus `npm run build:bible`. The app discovers translations from the generated `public/bible/index.json`.

## Milestones

1. Scaffold, PWA config, Pages deploy
2. Bible data pipeline, reading view, picker, search, themes
3. Verse selection, highlights, inline typed notes
4. Ink engine and in-app test page
5. Notebook panel: templates, split view, verse quotes, text boxes, shapes, lasso
6. Organization, notes index, search
7. Backup and restore, PDF and PNG export, persistence prompts
8. Polish, performance, accessibility, README

## Open risks

- **Real Pencil feel cannot be tested here.** Playwright simulates pointer events, so latency, pressure and palm rejection are on the manual list in `TESTING.md`.
- **`desynchronized` is not honoured by Safari**, so iPad latency relies on keeping frame work small.
- **Coalesced and predicted events vary by iPadOS version.** Both are feature-detected.
- **Canvas memory on iPad.** Overscan is capped so that large screens do not exceed iOS canvas limits.
- **Safari storage eviction** for non-installed sites. The app asks for persistent storage, prompts for install, and reminds about backups.
