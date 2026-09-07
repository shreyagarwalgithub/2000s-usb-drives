/**
 * Obtaining a set of files to scan, in a way that works across browsers.
 *
 * Preferred path: the File System Access API (window.showDirectoryPicker),
 * which returns a live directory handle we can recurse through lazily. This is
 * available on Chromium-based desktop browsers (Chrome, Edge).
 *
 * Fallback path: a hidden <input type="file" webkitdirectory> element. This is
 * more widely supported but loads the full file list up front and exposes only
 * relative paths (via webkitRelativePath), not live handles.
 */

/**
 * @returns {boolean} Whether the File System Access API is usable here.
 */
export function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Prompt the user to pick a directory using the File System Access API.
 * @returns {Promise<FileSystemDirectoryHandle|null>} Handle, or null if cancelled.
 */
export async function pickDirectoryHandle() {
  try {
    // "read" permission is enough; we never write to the drive.
    return await window.showDirectoryPicker({ mode: 'read' });
  } catch (err) {
    // AbortError = user cancelled the picker. Treat as no selection.
    if (err && err.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Collect files chosen through a webkitdirectory <input> element.
 * @param {HTMLInputElement} input
 * @returns {Array<{ file: File, path: string }>}
 */
export function collectFromInput(input) {
  const files = Array.from(input.files || []);
  return files.map((file) => ({
    file,
    // webkitRelativePath includes the chosen folder name as the first segment.
    path: file.webkitRelativePath || file.name,
  }));
}
