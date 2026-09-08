import {
  supportsFileSystemAccess,
  pickDirectoryHandle,
  collectFromInput,
  ensureWritePermission,
} from './scanner/filePicker.js';
import { scan, countFiles } from './scanner/directoryScanner.js';
import { classifyFile } from './classification/classifier.js';
import { runPool } from './utils/concurrency.js';
import { Progress } from './ui/progress.js';
import { Summary } from './ui/summary.js';
import { ResultsTable, MAX_LISTED_FILES } from './ui/resultsTable.js';
import { Logger } from './ui/logger.js';
import {
  buildReport,
  downloadReport,
  writeReportToFolder,
  readExistingReport,
  buildCacheIndex,
  cacheKey,
} from './report/report.js';

/** How many files to classify in parallel. Keeps the tab responsive. */
const CONCURRENCY = 8;

const els = {
  pickBtn: document.getElementById('pick-directory'),
  exportBtn: document.getElementById('export-report'),
  exportControls: document.getElementById('export-controls'),
  exportFormat: document.getElementById('export-format'),
  fallbackInput: document.getElementById('fallback-input'),
  supportNote: document.getElementById('support-note'),
  priorSection: document.getElementById('prior-report-section'),
  priorMessage: document.getElementById('prior-report-message'),
  reuseBtn: document.getElementById('reuse-report'),
  rescanBtn: document.getElementById('rescan'),
};

const progress = new Progress();
const summary = new Summary();
const table = new ResultsTable();
const logger = new Logger();

/** Cooperative cancellation flag, flipped by the Stop button. */
let cancelled = false;

/** The most recent report, kept so the Export button can download it. */
let currentReport = null;

/** The directory handle for the current scan (null on the fallback path). */
let currentDirHandle = null;

progress.onCancel(() => {
  cancelled = true;
});

els.exportBtn.addEventListener('click', () => {
  if (currentReport) {
    const format = els.exportFormat.value || 'html';
    downloadReport(currentReport, format);
    logger.success(`Report downloaded (${format.toUpperCase()}).`);
  }
});

// Decide which picking strategy to advertise based on browser support.
if (supportsFileSystemAccess()) {
  els.supportNote.textContent =
    'Your browser supports direct folder access. The scan report is saved into the chosen folder. Nothing else leaves your machine.';
  els.pickBtn.addEventListener('click', onPickWithHandle);
} else {
  els.supportNote.textContent =
    'Your browser lacks the File System Access API. Using folder-upload fallback (processed locally, not uploaded). The report can be downloaded but not saved back into the folder.';
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
  currentDirHandle = dirHandle;
  logger.success(`Selected folder: ${dirHandle.name || '(root)'}`);

  // Before scanning, look for a prior report so we don't re-scan unnecessarily.
  logger.info('Checking for a previous scan report...');
  const prior = await readExistingReport(dirHandle);
  if (prior) {
    logger.info(`Found a report from ${formatWhen(prior.generatedAt)}.`);
    promptReuseOrRescan(prior, { dirHandle });
    return;
  }
  logger.info('No previous report found. Scanning...');
  await runScan({ dirHandle });
}

async function onPickWithInput() {
  logger.show();
  currentDirHandle = null;
  const inputItems = collectFromInput(els.fallbackInput);
  if (inputItems.length === 0) {
    logger.warn('No files selected.');
    return;
  }
  logger.success(`Selected ${inputItems.length} files via folder upload.`);

  // The fallback path can't read a report back from the folder, so we always
  // scan fresh here.
  await runScan({ inputItems });
}

/**
 * Show the prompt asking whether to reuse a prior report or scan again.
 * @param {import('./report/report.js').ScanReport} prior
 * @param {Object} source The scan source to use if the user chooses to re-scan.
 */
function promptReuseOrRescan(prior, source) {
  const t = prior.totals || {};
  els.priorMessage.textContent =
    `A scan report already exists for "${prior.rootName}", generated ` +
    `${formatWhen(prior.generatedAt)} (${t.files ?? '?'} files). ` +
    `Reuse it, or scan again? Scanning again reuses unchanged files from the ` +
    `report to save time.`;
  els.priorSection.hidden = false;

  const cleanup = () => {
    els.priorSection.hidden = true;
    els.reuseBtn.onclick = null;
    els.rescanBtn.onclick = null;
  };

  els.reuseBtn.onclick = () => {
    cleanup();
    logger.success('Reusing the saved report.');
    renderFromReport(prior);
    currentReport = prior;
    els.exportControls.hidden = false;
  };

  els.rescanBtn.onclick = () => {
    cleanup();
    logger.info('Re-scanning (unchanged files will be reused from the report).');
    runScan(source, prior);
  };
}

/**
 * Render the Summary and results directly from a report, without scanning.
 * @param {import('./report/report.js').ScanReport} report
 */
function renderFromReport(report) {
  summary.show();
  table.show();
  table.reset();
  progress.show();

  for (const [type, { count, size }] of Object.entries(report.summary || {})) {
    // Feed the summary one aggregate "batch" per category by replaying counts.
    // Simpler: add directly to totals via repeated add would be O(files); we
    // instead push the aggregate in one shot.
    summary.addAggregate(type, count, size);
  }

  const files = report.files || [];
  for (const rec of files.slice(0, MAX_LISTED_FILES + 1)) {
    table.add({
      name: rec.name,
      path: rec.path,
      size: rec.size,
      type: rec.type,
      mime: rec.mime || '',
      detectedBy: rec.detectedBy,
    });
  }
  progress.finish(report.totals?.files ?? files.length);
  logger.success(
    `Loaded ${report.totals?.files ?? files.length} files from the saved report.`
  );
}

/**
 * Run a full scan + classification pass over the chosen source.
 *
 * Two passes:
 *   1. A fast count pass (names only, no byte reads) so the progress bar can be
 *      determinate. This is cheap even on huge drives.
 *   2. The classification pass, which reads file headers and populates the UI.
 *      If a prior report is supplied, unchanged files (matching path + size +
 *      lastModified) reuse the prior classification and skip byte reads.
 *
 * @param {Object} source Either { dirHandle } or { inputItems }.
 * @param {import('./report/report.js').ScanReport} [priorReport]
 */
async function runScan(source, priorReport = null) {
  cancelled = false;
  els.pickBtn.disabled = true;
  els.exportControls.hidden = true;
  currentReport = null;

  progress.show();
  summary.show();
  summary.reset();
  table.show();
  table.reset();

  const cache = buildCacheIndex(priorReport);
  if (cache.size > 0) {
    logger.info(`Loaded ${cache.size} cached file records to reuse.`);
  }

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
  let reused = 0;
  /** @type {import('./report/report.js').FileRecord[]} */
  const fileRecords = [];
  /**
   * Per-recognized-folder stats for logging and the report.
   * @type {Map<string, { label: string, note: string, importance: string, total: number, sampled: number }>}
   */
  const recognizedFolders = new Map();
  const entries = scan(source);

  await runPool(
    entries,
    async (entry) => {
      if (cancelled) return;

      const inRecognizedFolder = Boolean(entry.folder);
      const sampledForFolder = !inRecognizedFolder || entry.sampled;

      if (inRecognizedFolder) {
        const key = entry.folder.id;
        let stat = recognizedFolders.get(key);
        if (!stat) {
          stat = {
            label: entry.folder.label,
            note: entry.folder.note || '',
            importance: entry.folder.importance,
            total: 0,
            sampled: 0,
          };
          recognizedFolders.set(key, stat);
          logger.info(
            `Recognized folder "${entry.folder.label}" — sampling ~5%, ` +
              `labeling the rest. (${entry.folder.importance})`
          );
        }
        stat.total += 1;
        if (entry.sampled) stat.sampled += 1;
      }

      // Resolve file metadata (size + lastModified) so we can check the cache.
      // getFile() is cheap; only reading the file's bytes is expensive.
      let file;
      let size = entry.size;
      let lastModified = 0;
      try {
        file = await entry.getFile();
        if (size < 0) size = file.size;
        lastModified = file.lastModified || 0;
      } catch {
        file = undefined;
      }

      let result;
      const key = cacheKey(entry.path, size, lastModified);
      const cached = cache.get(key);

      if (cached) {
        // Unchanged since the last scan: reuse its classification, no byte read.
        result = {
          type: cached.type,
          mime: cached.mime,
          detectedBy: cached.detectedBy,
        };
        reused += 1;
      } else if (sampledForFolder) {
        if (!file) {
          errors += 1;
          logger.warn(`Could not read "${entry.path}"; classified by name only.`);
        }
        result = await classifyFile({ name: entry.name, file });
      } else {
        // In a recognized folder and not sampled: name-only classification.
        result = await classifyFile({ name: entry.name, readBytes: false });
      }

      count += 1;
      progress.update(count, entry.path);
      summary.add(result.type, size);

      fileRecords.push({
        path: entry.path,
        name: entry.name,
        size,
        lastModified,
        type: result.type,
        mime: result.mime || '',
        detectedBy: result.detectedBy,
        folder: entry.folder ? entry.folder.id : null,
        sampled: sampledForFolder,
      });

      const wasRemoved = table.listRemoved;
      table.add({
        name: entry.name,
        path: entry.path,
        size,
        type: result.type,
        mime: result.mime || '',
        detectedBy: result.detectedBy,
      });
      if (!wasRemoved && table.listRemoved) {
        logger.warn(
          `File list exceeded ${MAX_LISTED_FILES} files and was removed. ` +
            `Use the Summary and Logs instead.`
        );
      }

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
    if (reused > 0) {
      logger.success(`Reused ${reused} unchanged file(s) from the prior report.`);
    }
    if (errors > 0) {
      logger.warn(`${errors} file(s) could not be read and were classified by name only.`);
    }
  }

  if (recognizedFolders.size > 0) {
    let skippedTotal = 0;
    for (const stat of recognizedFolders.values()) {
      const skipped = stat.total - stat.sampled;
      skippedTotal += skipped;
      logger.info(
        `${stat.label}: ${stat.total} files, classified ${stat.sampled} ` +
          `(sample), labeled/skipped ${skipped}.`
      );
    }
    logger.success(
      `Folder intelligence skipped full classification of ${skippedTotal} ` +
        `file(s) across ${recognizedFolders.size} recognized folder(s).`
    );
  }

  // ---- Build the report, save it, and enable export ----
  if (!cancelled) {
    const rootName =
      currentDirHandle?.name ||
      (fileRecords[0]?.path.split('/')[0] ?? 'scan');
    currentReport = buildReport({
      rootName,
      summaryTotals: summary.totals,
      folderStats: recognizedFolders,
      fileRecords,
    });
    els.exportControls.hidden = false;

    await saveReportToFolder(currentReport);
  }

  finishRun(count, cancelled);
}

/**
 * Save the report into the scanned folder if we have a writable handle.
 * @param {import('./report/report.js').ScanReport} report
 */
async function saveReportToFolder(report) {
  if (!currentDirHandle) {
    logger.info('Report ready. Use "Export report" to download it.');
    return;
  }
  try {
    const writable = await ensureWritePermission(currentDirHandle);
    if (!writable) {
      logger.warn(
        'Write permission not granted; the report was not saved into the folder. ' +
          'You can still export it.'
      );
      return;
    }
    await writeReportToFolder(currentDirHandle, report);
    logger.success('Report saved into the scanned folder.');
  } catch (err) {
    logger.error(`Could not save the report into the folder: ${err.message || err}`);
  }
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

/**
 * Format an ISO timestamp as a friendly local date/time.
 * @param {string} iso
 * @returns {string}
 */
function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
