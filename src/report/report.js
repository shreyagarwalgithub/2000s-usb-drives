/**
 * Scan report: a detailed, machine-readable record of a scan.
 *
 * The report serves two purposes:
 *   1. A downloadable/saved artifact the user can keep, with a date and a
 *      per-category summary plus per-file records.
 *   2. A cache for future scans. On a re-scan we can match a file's
 *      path + size + lastModified against a prior record and skip re-reading
 *      its bytes, which speeds up scans and stabilizes classification.
 *
 * The canonical report is written into the scanned folder under a fixed name
 * (REPORT_FILENAME) so the next scan can find it. A separate, human-friendly
 * dated copy can also be downloaded.
 */

/** Fixed name of the report file written into the scanned folder. */
export const REPORT_FILENAME = '.usb-classifier-report.json';

/** Report schema version, so future readers can migrate old reports. */
export const REPORT_VERSION = 1;

/**
 * @typedef {Object} FileRecord
 * @property {string} path        Full relative path from the scan root.
 * @property {string} name        File name.
 * @property {number} size        Size in bytes (-1 if unknown).
 * @property {number} lastModified Epoch ms of last modification (0 if unknown).
 * @property {string} type        Classified ContentType.
 * @property {string} mime        Detected MIME type.
 * @property {string} detectedBy  How the type was decided.
 * @property {string|null} folder Recognized folder id, or null.
 * @property {boolean} sampled    Whether the file was fully classified (vs.
 *                                labeled via folder-intelligence sampling).
 */

/**
 * @typedef {Object} ScanReport
 * @property {number} version
 * @property {string} generatedAt  ISO timestamp.
 * @property {string} rootName      Name of the scanned folder/drive.
 * @property {Object} totals        { files, bytes }.
 * @property {Object} summary       Per-category { count, size }.
 * @property {Object} folders       Per-recognized-folder stats.
 * @property {FileRecord[]} files   Per-file records (the cache).
 */

/**
 * Build a report object from collected scan results.
 *
 * @param {Object} params
 * @param {string} params.rootName
 * @param {Map<string, { count: number, size: number }>} params.summaryTotals
 * @param {Map<string, { label: string, note: string, importance: string, total: number, sampled: number }>} params.folderStats
 * @param {FileRecord[]} params.fileRecords
 * @returns {ScanReport}
 */
export function buildReport({ rootName, summaryTotals, folderStats, fileRecords }) {
  let totalFiles = 0;
  let totalBytes = 0;
  const summary = {};
  for (const [type, { count, size }] of summaryTotals.entries()) {
    summary[type] = { count, size };
    totalFiles += count;
    totalBytes += size;
  }

  const folders = {};
  for (const [id, stat] of folderStats.entries()) {
    folders[id] = {
      label: stat.label,
      note: stat.note,
      importance: stat.importance,
      total: stat.total,
      sampled: stat.sampled,
      skipped: stat.total - stat.sampled,
    };
  }

  return {
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    rootName,
    totals: { files: totalFiles, bytes: totalBytes },
    summary,
    folders,
    files: fileRecords,
  };
}

/**
 * Serialize a report to pretty-printed JSON.
 * @param {ScanReport} report
 * @returns {string}
 */
export function serializeReport(report) {
  return JSON.stringify(report, null, 2);
}

/**
 * Trigger a browser download of the report with a dated, human-friendly name.
 * Works in every browser (no special permission needed).
 * @param {ScanReport} report
 */
export function downloadReport(report) {
  const json = serializeReport(report);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = report.generatedAt.slice(0, 10); // YYYY-MM-DD
  const safeRoot = (report.rootName || 'scan').replace(/[^\w.-]+/g, '_');

  const a = document.createElement('a');
  a.href = url;
  a.download = `usb-classifier-${safeRoot}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Write the report into the scanned folder under REPORT_FILENAME.
 * Requires a directory handle with readwrite permission. Overwrites any
 * previous report. Returns true on success.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {ScanReport} report
 * @returns {Promise<boolean>}
 */
export async function writeReportToFolder(dirHandle, report) {
  if (!dirHandle || typeof dirHandle.getFileHandle !== 'function') return false;
  const fileHandle = await dirHandle.getFileHandle(REPORT_FILENAME, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(serializeReport(report));
  await writable.close();
  return true;
}

/**
 * Read an existing report from the scanned folder, if present and valid.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<ScanReport|null>}
 */
export async function readExistingReport(dirHandle) {
  if (!dirHandle || typeof dirHandle.getFileHandle !== 'function') return null;
  try {
    const fileHandle = await dirHandle.getFileHandle(REPORT_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const report = JSON.parse(text);
    if (report && typeof report === 'object' && report.version) {
      return report;
    }
    return null;
  } catch {
    // Not found or unreadable/invalid — treat as no prior report.
    return null;
  }
}

/**
 * Build a lookup index from a report's file records, keyed by a cache key of
 * path + size + lastModified. Used to skip re-classifying unchanged files.
 *
 * @param {ScanReport|null} report
 * @returns {Map<string, FileRecord>}
 */
export function buildCacheIndex(report) {
  const index = new Map();
  if (!report || !Array.isArray(report.files)) return index;
  for (const rec of report.files) {
    index.set(cacheKey(rec.path, rec.size, rec.lastModified), rec);
  }
  return index;
}

/**
 * Cache key for a file. A file is considered unchanged if path, size, and
 * lastModified all match a prior record.
 * @param {string} path
 * @param {number} size
 * @param {number} lastModified
 * @returns {string}
 */
export function cacheKey(path, size, lastModified) {
  return `${path}\u0000${size}\u0000${lastModified}`;
}
