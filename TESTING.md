# Testing

## Automated

```sh
npm test                # Vitest
npm run test:e2e        # Playwright: WebKit, plus Chromium for the offline test
npm run verify:bible    # Word-for-word check against eBible's verse-per-line edition
```

The end-to-end tests use **simulated** pointer events. They prove the logic: a touch during a pen stroke is ignored, a stroke saves, a lasso moves ink. They can't tell you how a real Pencil feels, which is what the checklist below is for.

Lighthouse 13 no longer has a PWA category, so `e2e/offline.spec.ts` checks offline behavior and the manifest directly. Latest Lighthouse scores, with its mobile emulation: performance 90, accessibility 100, best practices 100. The performance score is held back by largest contentful paint of 3.6 s on the first visit over emulated slow mobile, before anything is cached.

## Manual iPad checklist

Only a real iPad and Pencil can verify these. Test on the deployed site, installed to the Home Screen. **Settings → Ink test page** shows live pressure, tilt, event counts and frame times.

### Install and offline

- [ ] Share → Add to Home Screen shows the Bible Notes icon and name
- [ ] It opens with no Safari bar, and the status bar and notch areas look right
- [ ] The splash screen appears in portrait and landscape
- [ ] Open it once online, wait a minute, then turn on **airplane mode** and force-quit it
- [ ] It opens offline, and a book you've never opened loads, in both translations
- [ ] Fonts look right offline (EB Garamond in the reader, Caveat in a text box)
- [ ] Search works offline
- [ ] Settings → Storage says your notes are protected

### Pencil feel (the most important section)

- [ ] **Latency:** write quickly. The ink should keep up closely. Note how far behind it trails.
- [ ] **Pressure:** press lightly then firmly in one stroke. Check the line width follows, especially with the Fountain pen.
- [ ] **Light touch:** very light writing still registers, with no skipped starts
- [ ] **Stroke starts and ends:** first and last marks of each word aren't dropped or hooked
- [ ] **Fast small writing** stays legible, with curves rather than corners
- [ ] **Tilt:** tilting the Pencil brush widens its line
- [ ] Ink doesn't flicker or shift when you lift the Pencil
- [ ] Writing on a page with lots of ink feels the same as on an empty page (the test page's **Add 5,000 strokes** button helps here)
- [ ] Check 1st and 2nd generation Pencil, if you have both

### Palm rejection

- [ ] Rest your palm **before** the Pencil touches, then write: no stray marks, and the page doesn't move
- [ ] Rest your palm **while** writing: no marks, no pan
- [ ] Lift the Pencil and leave your palm down, then lift your palm: nothing happens, even with the Text tool on
- [ ] Write a full page in your normal posture, then check for stray marks
- [ ] Note whether the 500 ms window after the Pencil lifts ever blocks a finger pan you meant to make

### Gestures

- [ ] One finger pans with momentum, and two fingers pinch smoothly
- [ ] No text selection, magnifier, callout or Scribble appears on the canvas
- [ ] Pinch then lift: the ink sharpens within a moment, and stays aligned
- [ ] Fast panning on a full page: note any blank areas before the ink paints in
- [ ] With "Let fingers draw too" on, a finger draws, and two fingers still zoom

### Tools

- [ ] Highlight your own handwriting: the ink stays crisp on top
- [ ] Check the same on white, cream and dark paper. Note how the highlighter looks while drawing, compared with after.
- [ ] Stroke and pixel erasers both behave, and one undo restores a whole erase
- [ ] Lasso-move, resize, recolor, copy, paste and delete ink, with the Pencil and with a finger
- [ ] Hold at the end of a stroke: a line, rectangle and ellipse each snap
- [ ] Hold a pause mid-handwriting: it isn't wrongly snapped
- [ ] Insert a photo from the library, then move and resize it

### Reader

- [ ] A finger tap selects, and a finger drag scrolls with no accidental selecting
- [ ] Press and hold with a finger, then drag, selects a range, without scrolling
- [ ] A Pencil tap selects, and a Pencil drag selects without scrolling
- [ ] In word mode, dragging selects words without scrolling
- [ ] Press a selected verse and drag it onto the notebook: a quote drops where you let go
- [ ] A handwritten note under a verse: the Pencil draws and a finger scrolls the Bible
- [ ] Rotate the iPad and use Split View and Slide Over. Nothing is clipped, and notes survive.

### Text

- [ ] Tap into a note: the keyboard appears, and the page doesn't zoom
- [ ] Text box above the keyboard: the page pans so the box stays visible
- [ ] Bold, lists, checkboxes, color, highlight, size and font all apply, from the toolbar and with an external keyboard
- [ ] Selecting text doesn't dismiss the toolbar

### Data safety

- [ ] Force-quit immediately after writing a stroke, then reopen. The stroke should be there, or at most the last half second missing.
- [ ] Back up to iCloud Drive through the Share sheet. If the Share sheet doesn't open right away, a **Save** button appears.
- [ ] Restore that file, trying Merge and Replace, and check ink and photos come back
- [ ] Export a page to PDF and PNG, and open them in Files. Check the ink, highlighter and text boxes look as they did on screen.

## Definition of done

Automated tests cover the logic of each item. The checks marked **manual** can only be confirmed on your iPad.

| Requirement | Automated | Manual |
| --- | --- | --- |
| Open from Pages, install, use in airplane mode | Offline test in WebKit and Chromium, manifest test | **Install flow** |
| John 3: select 16-17, highlight, typed note, lined side page | `notebook.spec.ts` "definition of done" | |
| Smooth Pencil writing with pressure variation | Pressure stored, performance measured | **Feel and latency** |
| Highlight handwriting, erase, undo, lasso-move | `ink.spec.ts`, `notebook.spec.ts` | |
| Palm resting with no stray marks | Simulated palm tests | **Real palm** |
| Fonts and colors on typed text | `notebook.spec.ts` text box test | |
| Find any note from the index | `library.spec.ts` | |
| Full backup and restore | `backup.test.ts`, `library.spec.ts` | **Share sheet** |
| No copyrighted text, licenses documented | `offline.spec.ts`, `verify-bible.ts`, About page | |
