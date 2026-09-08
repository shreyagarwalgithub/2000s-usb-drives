# USB Drive Classifier

A browser-based tool for making sense of old USB and hard drives. Point it at a
drive or folder, and it recursively scans every file and classifies it by
content type — video, image, audio, code, document, archive, and more.

**Everything runs locally in your browser.** No files are uploaded anywhere.

## Why

Old drives accumulate 15+ years of mixed content with no organization. Before
you can decide what to keep, back up, or delete, you first need to know what is
actually on the drive. This tool gives you that inventory as a first step, and
is built to grow into deeper, per-type analysis over time.

## Status

**Iteration 1 — classification only.** The app scans a drive and sorts every
file into a content category with a per-category summary and a filterable file
list. Deeper per-type "actions" (see the roadmap) are designed for but not yet
implemented.

## How classification works

Two heuristic engines, no ML model download required:

1. **Extension + MIME engine** (`src/classification/engines/extensionEngine.js`)
   — a fast first guess from the file extension. Needs only the file name, so
   it is essentially free even across hundreds of thousands of files.
2. **Magic-number engine** (`src/classification/engines/magicNumberEngine.js`)
   — reads just the first 64 bytes of a file and matches known file
   signatures. This is more reliable than the extension and works even when the
   extension is missing or wrong.

The orchestrator (`src/classification/classifier.js`) reconciles the two: the
magic-number result generally wins, with a documented exception for ZIP-based
container formats (`.docx`, `.xlsx`, `.epub`, ...) where the extension carries
the more specific meaning.

This heuristic approach was chosen deliberately over an ML model for v1: content
*type* is almost perfectly determined by extension + file signature, so an ML
classifier here would be slower, heavier, and less accurate. ML becomes valuable
in later iterations for the deeper questions (what is *in* an image, video
quality, etc.).

## File access

- **Preferred:** the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
  (`showDirectoryPicker`), available on Chromium-based desktop browsers (Chrome,
  Edge). It reads files lazily so a huge drive is never loaded into memory. The
  handle is requested **read-only**.
- **Fallback:** a `<input type="file" webkitdirectory>` folder picker for
  browsers without the API. Files are still processed locally, never uploaded.

Scanning is streamed through a bounded worker pool
(`src/utils/concurrency.js`), so even very large drives stay responsive and
memory usage stays flat. System/metadata folders (`$RECYCLE.BIN`,
`System Volume Information`, `.git`, ...) are skipped entirely.

## Folder intelligence

Old drives are full of well-known folders whose contents are predictable and
mostly disposable: browser caches, temp directories, application support data,
and dependency folders like `node_modules`. Fully classifying every file in a
50,000-file Chrome cache is wasted effort.

`src/scanner/folderIntelligence.js` keeps a dictionary of such folders, matched
by path (with context, e.g. a `Cache` folder specifically under
`Google/Chrome`). When the scanner enters a recognized folder it:

1. Labels the whole folder (e.g. "Google Chrome cache", marked *disposable*).
2. Fully classifies only a random ~5% sample of its files.
3. Attributes the rest to the folder's label without reading their bytes.

The Logs panel reports each recognized folder and how many files were sampled
vs. skipped. Recognized categories include browser caches (Chrome, Chromium,
Edge, Firefox, Safari), generic caches, temp folders, Windows/macOS app data and
system stores, and build/dependency artifacts. Add new ones by extending
`FOLDER_PATTERNS`.

## Scan reports (save, export, and reuse)

Every scan produces a detailed report (`src/report/report.js`) containing:

- Metadata: generation timestamp and the scanned folder name.
- Totals and the per-category summary (counts and sizes).
- Folder-intelligence results (which folders were recognized, sampled/skipped).
- A per-file record: path, name, size, last-modified, classified type, MIME,
  how it was detected, and its folder/sampling status.

The report is used two ways:

1. **Saved and exportable.** On the File System Access API path, the report is
   written into the scanned folder as `.usb-classifier-report.json`. On any
   browser, the **Export report** button downloads a dated copy
   (`usb-classifier-<folder>-<YYYY-MM-DD>.json`). Saving into the folder is why
   the app requests read-write access; it only ever writes that one file and
   never modifies or deletes your existing content.

2. **Reused to avoid needless work.** When you pick a folder that already
   contains a report, the app reads it first and asks whether to **reuse** it or
   **scan again**. If you scan again, files that are unchanged (same path, size,
   and last-modified) reuse their prior classification and skip the byte read,
   so re-scans are much faster and classification stays stable.

## Getting started

Requires Node.js 18+ and a Chromium-based browser for the best experience.

```bash
npm install
npm run dev      # start the local dev server (opens the app)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

Then click **Choose a folder / drive**, pick your USB drive, and watch the
summary and file list populate as it scans.

## Project structure

```
src/
├── main.js                      App bootstrap; wires picker -> scan -> classify -> UI
├── styles.css
├── scanner/
│   ├── filePicker.js            File System Access API + webkitdirectory fallback
│   ├── directoryScanner.js      Recursive, streaming directory walk
│   └── folderIntelligence.js    Dictionary of well-known folders + 5% sampling
├── report/
│   └── report.js                Build/save/export/reuse the scan report (cache)
├── classification/
│   ├── classifier.js            Orchestrates the engines
│   ├── types.js                 ContentType categories + labels
│   ├── engines/
│   │   ├── extensionEngine.js   Extension/MIME lookup (fast path)
│   │   └── magicNumberEngine.js Byte-signature detection (accuracy path)
│   └── actions/
│       ├── actionRegistry.js    Per-type action hooks (stubs in v1)
│       └── README.md            Specs for the planned per-type actions
├── ui/
│   ├── resultsTable.js          Streaming, filterable file list
│   ├── summary.js               Per-category counts and sizes
│   └── progress.js              Live scan progress
└── utils/
    ├── format.js                Human-readable sizes/counts
    └── concurrency.js           Bounded worker pool for large drives
```

See [`docs/architecture.md`](docs/architecture.md) for how the pieces fit
together and how to extend them.

## Roadmap — per-type actions (future iterations)

Once a file's type is known, a type-specific "action" can enrich it. These are
specced in [`src/classification/actions/README.md`](src/classification/actions/README.md)
and stubbed in the action registry so they can be added without touching the
scanner or classifier.

| Type      | v1          | Planned action |
|-----------|-------------|----------------|
| Video     | classify    | Estimate quality (resolution/bitrate); check OTT availability; flag **delete** if available, **preserve** if not. Deletion is always an explicit, confirmed action — never automatic. |
| Image     | classify    | In-browser object/scene detection to describe what's in the picture. |
| Code      | classify    | Generate a README summarizing what a code folder is about. |
| Audio     | classify    | TBD |
| Document  | classify    | TBD |
| Archive   | classify    | TBD |

### Safety notes for future actions

- Scanning uses a **read-only** directory handle. No file is ever modified or
  deleted during classification.
- Any future delete flow requires a separately-granted read-write permission and
  explicit user confirmation per file.
- Any action that needs the network (e.g. OTT availability lookup) will be
  opt-in and will send only minimal derived metadata (like a guessed title),
  never file contents.

## Privacy

All scanning and classification happen entirely in your browser. Files and their
contents never leave your machine. The app requests read-write access only so it
can save its own report file (`.usb-classifier-report.json`) into the scanned
folder; it never modifies or deletes your existing files, and it makes no
network requests with your data.

## License

MIT
