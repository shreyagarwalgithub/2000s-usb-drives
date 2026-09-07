# Per-Type Actions

Actions are type-specific analysis steps that run **after** a file has been
classified. Iteration 1 ships classification only; the actions below are
documented specs with stub implementations in `actionRegistry.js`. Each stub
reports "not implemented yet" until it is built out.

## How actions plug in

`actionRegistry.js` maps a `ContentType` to an `Action` function:

```js
async function action(ctx) {
  // ctx: { name, path, size, mime, getFile() }
  return { implemented: true, summary: '...', data: { /* ... */ } };
}
```

To enable an action, replace its stub in the registry with a real
implementation. The scanner and classifier do not need to change.

## Planned actions

### Video — quality + OTT availability

Goal: for each video, estimate quality and decide keep vs. delete.

- **Quality:** read resolution, duration, and bitrate. In-browser options:
  load into a hidden `<video>` element and read `videoWidth`/`videoHeight`, or
  parse container metadata from the file header. Derive a label (e.g. SD / HD /
  Full HD / 4K).
- **OTT availability:** derive a probable title from the filename/folder, then
  query a catalog/availability source. This requires a network call to a
  third-party API and is therefore **not** purely offline — it must be opt-in
  and clearly disclosed to the user before any request is made.
- **Decision:** if the title is available on an OTT platform, flag for
  **delete**; if not, flag for **preserve**. v1 will only *flag* and never
  delete automatically. Any actual deletion must be an explicit, confirmed user
  action (and requires a read-write directory handle, not the read-only handle
  used for scanning).

### Image — content detection

Goal: describe what is in each picture.

- Run an in-browser model (e.g. a TensorFlow.js or ONNX Runtime Web image
  classifier / object detector) over a downscaled version of the image.
- Return top labels and confidence scores as `data`, and a short human-readable
  `summary`.
- Fully offline once the model is cached.

### Code — folder README

Goal: for a folder of code, generate a README describing what it is about.

- Aggregate signals per folder: languages present, entry-point files, package
  manifests (`package.json`, `requirements.txt`, `pom.xml`, etc.), and any
  existing docs.
- Produce a short generated summary of the project's purpose and structure.
- Note: this action is naturally **folder-scoped** rather than file-scoped, so
  enabling it will also involve a folder-level pass in the scanner.

## Safety notes

- Scanning uses a **read-only** directory handle. No action may delete or modify
  files without an explicit, separately-granted read-write permission and user
  confirmation.
- Any action that makes a network request (e.g. OTT lookup) must be opt-in and
  must not transmit file contents — only minimal derived metadata such as a
  guessed title.
