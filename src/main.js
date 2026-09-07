import {
  supportsFileSystemAccess,
  pickDirectoryHandle,
  collectFromInput,
} from './scanner/filePicker.js';
import { scan } from './scanner/directoryScanner.js';
import { classifyFile } from './classification/classifier.js';
import { runPool } from './utils/concurrency.js';
import { Progress } from './ui/progress.js';
import { Summary } from './ui/summary.js';
import { ResultsTable } from './ui/resultsTable.js';

/** How many files to classify in parallel. Keeps the tab responsive. */
const CONCURRENCY = 8;

const els = {
  pickBtn: document.getElementById('pick-directory'),
  fallbackInput: document.getElementById('fallback-input'),
  supportNote: document.getElementById('support-note'),
};

const progress = new Progress();
const summary = new Summary();
const table = new ResultsTable();

/** Cooperative cancellation flag, flipped by the Stop button. */
let cancelled = false;

progress.onCancel(() => {
  cancelled = true;
});

// Decide which picking strategy to advertise based on browser support.
if (supportsFileSystemAccess()) {
  els.supportNote.textContent =
    'Your browser supports direct folder access. Nothing leaves your machine.';
  els.pickBtn.addEventListener('click', onPickWithHandle);
} else {
  els.supportNote.textContent =
    'Your browser lacks the File System Access API. Using folder-upload fallback (files are still processed locally, not uploaded).';
  els.pickBtn.addEventListener('click', () => els.fallbackInput.click());
  els.fallbackInput.addEventListener('change', onPickWithInput);
}

async function onPickWithHandle() {
  const dirHandle = await pickDirectoryHandle();
  if (!dirHandle) return; // user cancelled
  await runScan({ dirHandle });
}

async function onPickWithInput() {
  const inputItems = collectFromInput(els.fallbackInput);
  if (inputItems.length === 0) return;
  await runScan({ inputItems });
}

/**
 * Run a full scan + classification pass over the chosen source.
 * @param {Object} source Either { dirHandle } or { inputItems }.
 */
async function runScan(source) {
  cancelled = false;
  els.pickBtn.disabled = true;

  progress.show();
  summary.show();
  table.show();

  let count = 0;
  const entries = scan(source);

  await runPool(
    entries,
    async (entry) => {
      if (cancelled) return;

      let file;
      let size = entry.size;
      try {
        file = await entry.getFile();
        if (size < 0) size = file.size;
      } catch {
        // File may be unreadable (drive removed, permissions). Classify by name.
        file = undefined;
      }

      const result = await classifyFile({ name: entry.name, file });

      count += 1;
      progress.update(count, entry.path);
      summary.add(result.type, size);
      table.add({
        name: entry.name,
        path: entry.path,
        size,
        type: result.type,
        mime: result.mime || '',
        detectedBy: result.detectedBy,
      });
    },
    { concurrency: CONCURRENCY, shouldStop: () => cancelled }
  );

  progress.finish(count);
  els.pickBtn.disabled = false;
}
