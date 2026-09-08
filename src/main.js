import {
  supportsFileSystemAccess,
  pickDirectoryHandle,
  collectFromInput,
} from './scanner/filePicker.js';
import { scan, countFiles } from './scanner/directoryScanner.js';
import { classifyFile } from './classification/classifier.js';
import { runPool } from './utils/concurrency.js';
import { Progress } from './ui/progress.js';
import { Summary } from './ui/summary.js';
import { ResultsTable } from './ui/resultsTable.js';
import { Logger } from './ui/logger.js';

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
const logger = new Logger();

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
  logger.show();
  logger.info('Opening the folder picker...');
  const dirHandle = await pickDirectoryHandle();
  if (!dirHandle) {
    logger.warn('No folder selected (picker cancelled).');
    return;
  }
  logger.success(`Selected folder: ${dirHandle.name || '(root)'}`);
  await runScan({ dirHandle });
}

async function onPickWithInput() {
  logger.show();
  const inputItems = collectFromInput(els.fallbackInput);
  if (inputItems.length === 0) {
    logger.warn('No files selected.');
    return;
  }
  logger.success(`Selected ${inputItems.length} files via folder upload.`);
  await runScan({ inputItems });
}

/**
 * Run a full scan + classification pass over the chosen source.
 *
 * Two passes:
 *   1. A fast count pass (names only, no byte reads) so the progress bar can be
 *      determinate. This is cheap even on huge drives.
 *   2. The classification pass, which reads file headers and populates the UI.
 *
 * @param {Object} source Either { dirHandle } or { inputItems }.
 */
async function runScan(source) {
  cancelled = false;
  els.pickBtn.disabled = true;

  progress.show();
  summary.show();
  table.show();

  // ---- Pass 1: count files so the bar has a total ----
  progress.setTotal(0); // indeterminate while counting
  logger.info('Counting files (this may take a moment on large drives)...');
  let total = 0;
  try {
    total = await countFiles(source, () => cancelled);
  } catch (err) {
    logger.error(`Failed while counting files: ${err.message || err}`);
  }

  if (cancelled) {
    logger.warn('Scan cancelled during counting.');
    finishRun(0, true);
    return;
  }

  progress.setTotal(total);
  logger.success(`Found ${total} files. Starting classification...`);

  // ---- Pass 2: classify ----
  let count = 0;
  let errors = 0;
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
      } catch (err) {
        // File may be unreadable (drive removed, permissions). Classify by name.
        file = undefined;
        errors += 1;
        logger.warn(`Could not read "${entry.path}"; classified by name only.`);
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

      // Periodic milestone log so the panel shows steady progress.
      if (count % 500 === 0) {
        logger.info(`Classified ${count} files so far...`);
      }
    },
    { concurrency: CONCURRENCY, shouldStop: () => cancelled }
  );

  if (cancelled) {
    logger.warn(`Scan stopped by user after ${count} files.`);
  } else {
    logger.success(`Done. Classified ${count} files.`);
    if (errors > 0) {
      logger.warn(`${errors} file(s) could not be read and were classified by name only.`);
    }
  }
  finishRun(count, cancelled);
}

/**
 * Reset UI state at the end of a run.
 * @param {number} count   Files classified.
 * @param {boolean} wasCancelled Whether the run was stopped early.
 */
function finishRun(count, wasCancelled) {
  if (wasCancelled) {
    progress.stopped(count);
  } else {
    progress.finish(count);
  }
  els.pickBtn.disabled = false;
}
