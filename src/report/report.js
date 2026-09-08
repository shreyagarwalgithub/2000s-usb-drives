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
 * Trigger a browser download of the report in the given format.
 * Works in every browser (no special permission needed).
 *
 * @param {ScanReport} report
 * @param {'json'|'csv'|'html'} [format='json']
 */
export function downloadReport(report, format = 'json') {
  const { content, mime, ext } = renderReport(report, format);
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const date = report.generatedAt.slice(0, 10); // YYYY-MM-DD
  const safeRoot = (report.rootName || 'scan').replace(/[^\w.-]+/g, '_');

  const a = document.createElement('a');
  a.href = url;
  a.download = `usb-classifier-${safeRoot}-${date}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Render a report to the requested format.
 * @param {ScanReport} report
 * @param {'json'|'csv'|'html'} format
 * @returns {{ content: string, mime: string, ext: string }}
 */
export function renderReport(report, format) {
  switch (format) {
    case 'csv':
      return {
        content: serializeReportCsv(report),
        mime: 'text/csv',
        ext: 'csv',
      };
    case 'html':
      return {
        content: serializeReportHtml(report),
        mime: 'text/html',
        ext: 'html',
      };
    case 'json':
    default:
      return {
        content: serializeReport(report),
        mime: 'application/json',
        ext: 'json',
      };
  }
}

/**
 * Serialize the per-file records as CSV, plus the file is spreadsheet-friendly.
 * Columns: path, name, sizeBytes, lastModified (ISO), type, mime, detectedBy,
 * folder, sampled.
 * @param {ScanReport} report
 * @returns {string}
 */
export function serializeReportCsv(report) {
  const header = [
    'path',
    'name',
    'sizeBytes',
    'lastModified',
    'type',
    'mime',
    'detectedBy',
    'folder',
    'sampled',
  ];
  const rows = [header.map(csvCell).join(',')];
  for (const rec of report.files || []) {
    const lm = rec.lastModified ? new Date(rec.lastModified).toISOString() : '';
    rows.push(
      [
        rec.path,
        rec.name,
        rec.size,
        lm,
        rec.type,
        rec.mime || '',
        rec.detectedBy,
        rec.folder || '',
        rec.sampled ? 'yes' : 'no',
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return rows.join('\r\n');
}

/**
 * Escape a value for CSV: wrap in quotes and double any inner quotes when the
 * value contains a comma, quote, or newline.
 * @param {*} value
 * @returns {string}
 */
function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize the report as a self-contained, styled HTML page: metadata,
 * per-category summary, folder intelligence, and (a capped) file list.
 * @param {ScanReport} report
 * @returns {string}
 */
export function serializeReportHtml(report) {
  const esc = escapeHtml;
  const generated = new Date(report.generatedAt).toLocaleString();
  const totalFiles = report.totals?.files ?? 0;
  const totalBytes = report.totals?.bytes ?? 0;

  // Summary rows, sorted by descending count.
  const summaryEntries = Object.entries(report.summary || {}).sort(
    (a, b) => b[1].count - a[1].count
  );
  const summaryRows = summaryEntries
    .map(([type, { count, size }]) => {
      const cPct = totalFiles ? Math.round((count / totalFiles) * 100) : 0;
      const sPct = totalBytes ? Math.round((size / totalBytes) * 100) : 0;
      return `<tr><td>${esc(type)}</td><td>${count} (${cPct}%)</td><td>${formatBytesHtml(
        size
      )} (${sPct}%)</td></tr>`;
    })
    .join('');

  // Folder intelligence rows.
  const folderEntries = Object.entries(report.folders || {});
  const folderRows = folderEntries
    .map(
      ([id, f]) =>
        `<tr><td>${esc(f.label || id)}</td><td>${esc(
          f.importance || ''
        )}</td><td>${f.total}</td><td>${f.sampled}</td><td>${f.skipped}</td></tr>`
    )
    .join('');
  const folderSection = folderEntries.length
    ? `<h2>Recognized folders</h2>
       <table>
         <thead><tr><th>Folder</th><th>Importance</th><th>Files</th><th>Sampled</th><th>Skipped</th></tr></thead>
         <tbody>${folderRows}</tbody>
       </table>`
    : '';

  // File list, capped to keep the HTML from getting huge.
  const FILE_CAP = 1000;
  const files = report.files || [];
  const shownFiles = files.slice(0, FILE_CAP);
  const fileRows = shownFiles
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td>${esc(
          r.mime || ''
        )}</td><td>${formatBytesHtml(r.size)}</td><td class="path">${esc(
          r.path
        )}</td></tr>`
    )
    .join('');
  const fileNote =
    files.length > FILE_CAP
      ? `<p class="note">Showing the first ${FILE_CAP} of ${files.length} files. The full list is in the JSON/CSV export.</p>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>USB Classifier report — ${esc(report.rootName || '')}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; color: #1a2130; }
  h1 { margin-bottom: 0.25rem; }
  .meta { color: #667; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #e2e6ee; }
  th { background: #f4f6fa; }
  td.path { color: #667; font-family: ui-monospace, Menlo, monospace; font-size: 0.8rem; }
  .note { color: #667; font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>USB Drive Classifier report</h1>
  <p class="meta">
    Folder: <strong>${esc(report.rootName || '(unknown)')}</strong> ·
    Generated: ${esc(generated)} ·
    ${totalFiles} files · ${formatBytesHtml(totalBytes)}
  </p>

  <h2>Summary by type</h2>
  <table>
    <thead><tr><th>Type</th><th>Files (share)</th><th>Size (share)</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>

  ${folderSection}

  <h2>Files</h2>
  ${fileNote}
  <table>
    <thead><tr><th>Name</th><th>Type</th><th>MIME</th><th>Size</th><th>Path</th></tr></thead>
    <tbody>${fileRows}</tbody>
  </table>
</body>
</html>`;
}

/** Escape a string for safe insertion into HTML text/attributes. */
function escapeHtml(value) {
  const s = value == null ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Compact human-readable byte size for the HTML report (no external deps). */
function formatBytesHtml(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const e = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, e);
  const r = v >= 100 || e === 0 ? Math.round(v) : v.toFixed(1);
  return `${r} ${units[e]}`;
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
