/**
 * Folder intelligence.
 *
 * A lot of what accumulates on old drives lives inside well-known folders whose
 * contents are predictable and mostly disposable: browser caches, OS temp
 * directories, application support data, package/dependency folders, and so on.
 * Fully classifying every file in a 50,000-file Chrome cache is wasted effort.
 *
 * This module recognizes such folders from a dictionary of patterns. When a
 * folder is recognized, the scanner samples only a small random fraction of its
 * files (see SAMPLE_RATE) and labels the whole folder, skipping the rest.
 *
 * Matching is done on the folder's path segments so we can require context
 * (e.g. a "Cache" folder specifically under "Google/Chrome"), not just a bare
 * name that could mean anything.
 */

/** Fraction of files to actually classify inside a recognized folder. */
export const SAMPLE_RATE = 0.05; // 5%

/**
 * Importance hints for recognized folders. Purely advisory metadata surfaced
 * in the UI to help the user decide what is safe to delete.
 */
export const Importance = Object.freeze({
  DISPOSABLE: 'disposable', // caches, temp — safe to delete
  APP_DATA: 'app-data', // application state/config — usually not user content
  SYSTEM: 'system', // OS/system files
  DEPENDENCY: 'dependency', // build/dependency artifacts
});

/**
 * @typedef {Object} FolderPattern
 * @property {string} id             Stable identifier.
 * @property {string} label          Human-readable label for the folder.
 * @property {string} importance     One of Importance.
 * @property {RegExp} match          Tested against the folder's full relative path.
 * @property {string} [note]         Short explanation shown to the user.
 */

/**
 * The dictionary of well-known folders. Patterns are matched case-insensitively
 * against the folder's full path (segments joined by "/"). Order matters only
 * in that the first match wins.
 *
 * @type {FolderPattern[]}
 */
export const FOLDER_PATTERNS = [
  // ---- Browser caches ----
  {
    id: 'chrome-cache',
    label: 'Google Chrome cache',
    importance: Importance.DISPOSABLE,
    match: /(^|\/)Google\/Chrome\/.*Cache/i,
    note: 'Browser cache written by Google Chrome. Almost always disposable.',
  },
  {
    id: 'chromium-cache',
    label: 'Chromium cache',
    importance: Importance.DISPOSABLE,
    match: /(^|\/)Chromium\/.*Cache/i,
    note: 'Browser cache written by Chromium. Almost always disposable.',
  },
  {
    id: 'edge-cache',
    label: 'Microsoft Edge cache',
    importance: Importance.DISPOSABLE,
    match: /(^|\/)Microsoft\/Edge\/.*Cache/i,
    note: 'Browser cache written by Microsoft Edge. Almost always disposable.',
  },
  {
    id: 'firefox-cache',
    label: 'Firefox cache',
    importance: Importance.DISPOSABLE,
    match: /(^|\/)(Mozilla\/)?Firefox\/.*(cache2?|Cache)/i,
    note: 'Browser cache written by Firefox. Almost always disposable.',
  },
  {
    id: 'safari-cache',
    label: 'Safari cache',
    importance: Importance.DISPOSABLE,
    match: /(^|\/)com\.apple\.Safari\/.*Cache/i,
    note: 'Browser cache written by Safari. Almost always disposable.',
  },
  // Generic cache folders as a catch-all (lower confidence, still disposable).
  {
    id: 'generic-cache',
    label: 'Cache folder',
    importance: Importance.DISPOSABLE,
    match: /(^|\/)(Caches?|GPUCache|Code Cache)(\/|$)/i,
    note: 'A cache folder. Contents are typically regenerated and disposable.',
  },

  // ---- Temp ----
  {
    id: 'temp',
    label: 'Temporary files',
    importance: Importance.DISPOSABLE,
    match: /(^|\/)(Temp|tmp|Temporary Internet Files)(\/|$)/i,
    note: 'Temporary files. Usually safe to delete.',
  },

  // ---- OS / system ----
  {
    id: 'windows-winsxs',
    label: 'Windows component store (WinSxS)',
    importance: Importance.SYSTEM,
    match: /(^|\/)Windows\/WinSxS(\/|$)/i,
    note: 'Windows system component store. Do not delete manually.',
  },
  {
    id: 'windows-installer',
    label: 'Windows Installer cache',
    importance: Importance.SYSTEM,
    match: /(^|\/)Windows\/Installer(\/|$)/i,
    note: 'Windows Installer cache.',
  },
  {
    id: 'appdata-local',
    label: 'Application data (Local)',
    importance: Importance.APP_DATA,
    match: /(^|\/)AppData\/Local(\/|$)/i,
    note: 'Local application data. Mostly app state, not user content.',
  },
  {
    id: 'library-app-support',
    label: 'Application Support (macOS)',
    importance: Importance.APP_DATA,
    match: /(^|\/)Library\/Application Support(\/|$)/i,
    note: 'macOS application support data. Mostly app state, not user content.',
  },

  // ---- Dependencies / build artifacts ----
  {
    id: 'node-modules',
    label: 'Node.js dependencies (node_modules)',
    importance: Importance.DEPENDENCY,
    match: /(^|\/)node_modules(\/|$)/i,
    note: 'Installed Node.js packages. Reproducible from package manifests.',
  },
  {
    id: 'python-venv',
    label: 'Python virtual environment',
    importance: Importance.DEPENDENCY,
    match: /(^|\/)(venv|\.venv|site-packages|__pycache__)(\/|$)/i,
    note: 'Python environment/build artifacts. Reproducible.',
  },
  {
    id: 'build-output',
    label: 'Build output',
    importance: Importance.DEPENDENCY,
    match: /(^|\/)(dist|build|target|\.gradle|\.next|out)(\/|$)/i,
    note: 'Build output directory. Reproducible from source.',
  },
];

/**
 * Test whether a folder path matches a known pattern.
 * @param {string} path Full relative path of the folder.
 * @returns {FolderPattern|null} The first matching pattern, or null.
 */
export function recognizeFolder(path) {
  if (!path) return null;
  for (const pattern of FOLDER_PATTERNS) {
    if (pattern.match.test(path)) return pattern;
  }
  return null;
}

/**
 * Deterministic-ish sampling decision for a file index within a folder.
 *
 * We sample by index rather than Math.random() so that the count pass and the
 * classification pass make the SAME sampling decisions (given files are visited
 * in the same order), keeping the progress bar's total accurate.
 *
 * Every Nth file is sampled where N = round(1 / SAMPLE_RATE). The first file
 * (index 0) is always sampled so even tiny folders get at least one probe.
 *
 * @param {number} index Zero-based index of the file within its folder.
 * @returns {boolean} Whether this file should be fully classified.
 */
export function shouldSample(index) {
  const stride = Math.max(1, Math.round(1 / SAMPLE_RATE));
  return index % stride === 0;
}
