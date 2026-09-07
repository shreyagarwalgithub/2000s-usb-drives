# Architecture

The app is a fully client-side, single-page application with no backend. It is
organized into four layers that each do one job and hand off cleanly to the
next.

## Data flow

```
User picks a folder/drive
        │
        ▼
┌───────────────────┐   FileSystemDirectoryHandle (preferred)
│  scanner/         │   or webkitdirectory file list (fallback)
│  filePicker.js    │
└─────────┬─────────┘
          ▼
┌───────────────────┐   Async generator streaming FileEntry objects
│  scanner/         │   { name, path, size, getFile() }
│  directoryScanner │   (recursive, skips system folders)
└─────────┬─────────┘
          ▼
┌───────────────────┐   Bounded worker pool (utils/concurrency.js)
│  main.js          │   pulls entries, calls the classifier, feeds the UI
└─────────┬─────────┘
          ▼
┌───────────────────┐   classifyFile({ name, file })
│  classification/  │   → { type, detectedBy, mime }
│  classifier.js    │
└───┬───────────┬───┘
    │           │
    ▼           ▼
extensionEngine  magicNumberEngine
(name → type)    (first 64 bytes → type)
          │
          ▼
┌───────────────────┐
│  ui/              │   summary cards + streaming, filterable table
│  progress/summary │   + live progress
│  /resultsTable    │
└───────────────────┘
```

## Layers

### Scanner (`src/scanner/`)

Turns a user selection into a stream of file entries.

- `filePicker.js` abstracts the two ways of getting files: the File System
  Access API (`showDirectoryPicker`, requested read-only) and the
  `webkitdirectory` `<input>` fallback.
- `directoryScanner.js` exposes both sources as **async generators** yielding a
  uniform `FileEntry` (`{ name, path, size, getFile() }`). Using generators
  keeps memory flat: entries are produced and consumed one at a time rather than
  building a giant array. `getFile()` resolves the actual `File` lazily so bytes
  are only touched when needed.

### Classification (`src/classification/`)

Decides the content type of a single file.

- `types.js` defines the `ContentType` categories and their display labels, plus
  a `Confidence` marker recording *how* a type was decided.
- `engines/extensionEngine.js` maps extension → type/MIME. Fast, name-only.
- `engines/magicNumberEngine.js` matches the first 64 bytes against known file
  signatures. More reliable; reads a tiny slice, not the whole file.
- `classifier.js` orchestrates: it runs the extension guess, then the
  magic-number check, and reconciles them. Magic wins by default, with a
  documented exception for ZIP-based containers (docx/xlsx/epub/...) where the
  extension is more specific than a raw ZIP signature.
- `actions/` is the extension point for future per-type analysis (see its
  README). Stubbed in v1.

### UI (`src/ui/`)

Renders results as they stream in, without blocking the main thread.

- `progress.js` shows files-scanned count and current path.
- `summary.js` maintains per-category counts and total sizes.
- `resultsTable.js` appends rows and supports filtering by type.

All three batch their DOM writes with `requestAnimationFrame` so that appending
thousands of rows during a fast scan stays smooth.

### Utils (`src/utils/`)

- `concurrency.js` — `runPool` runs a fixed number of workers over the entry
  stream with cooperative cancellation (`shouldStop`). This is what keeps a
  multi-hundred-thousand-file drive from freezing the tab.
- `format.js` — human-readable byte sizes and counts.

## Extension points

- **Add a file type:** add an entry to `EXTENSION_MAP` in `extensionEngine.js`
  and, if it has a distinctive header, a signature in `magicNumberEngine.js`.
- **Add a category:** add it to `ContentType` and `ContentTypeLabel` in
  `types.js`.
- **Add a per-type action:** replace the relevant stub in
  `actions/actionRegistry.js`. The scanner and classifier do not need to change.

## Design decisions

- **Heuristics over ML for v1.** Content *type* is decided by extension + file
  signature with near-perfect accuracy and zero model download. ML is reserved
  for later, deeper questions (image contents, video quality).
- **Streaming everywhere.** Generators + a bounded worker pool + batched DOM
  updates keep memory flat and the UI responsive on very large drives.
- **Read-only by default.** Scanning never modifies the drive. Any future
  destructive action requires separate permission and explicit confirmation.
- **Vanilla JS + Vite.** No framework, for reliability and minimal moving parts.
```
