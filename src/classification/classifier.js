import { ContentType, Confidence } from './types.js';
import { classifyByExtension, getExtension } from './engines/extensionEngine.js';
import { classifyByMagic, readHeader } from './engines/magicNumberEngine.js';

/**
 * Extensions that are ZIP-based containers. Their magic number is a plain ZIP
 * signature, but the extension carries the more specific, correct meaning
 * (e.g. .docx is a Document, not a generic Archive). For these we trust the
 * extension over the raw ZIP magic number.
 */
const ZIP_BASED_EXTENSIONS = new Set([
  'docx', 'xlsx', 'pptx', 'epub', 'odt', 'ods', 'jar', 'apk',
]);

/**
 * Classify a single file.
 *
 * Strategy:
 *   1. Guess from the extension (free, needs only the name).
 *   2. If we can read bytes, read the header and try magic-number detection.
 *   3. Reconcile the two:
 *      - Magic-number result generally wins (more reliable).
 *      - Exception: for ZIP-based container formats, the extension is more
 *        specific than the generic ZIP magic number, so the extension wins.
 *      - If magic finds nothing, fall back to the extension guess.
 *
 * @param {Object} params
 * @param {string} params.name              File name.
 * @param {File|Blob} [params.file]         The file, if bytes are readable.
 * @param {boolean} [params.readBytes=true] Whether to read header bytes.
 * @returns {Promise<import('./types.js').ClassificationResult>}
 */
export async function classifyFile({ name, file, readBytes = true }) {
  const byExt = classifyByExtension(name);

  if (!readBytes || !file || file.size === 0) {
    return byExt;
  }

  let byMagic = null;
  try {
    const header = await readHeader(file);
    byMagic = classifyByMagic(header);
  } catch {
    // Reading may fail (permissions, removed drive). Fall back to extension.
    return byExt;
  }

  if (!byMagic) {
    return byExt;
  }

  // ZIP-based container: prefer the more specific extension classification.
  const ext = getExtension(name);
  if (byMagic.mime === 'application/zip' && ZIP_BASED_EXTENSIONS.has(ext)) {
    return byExt.type !== ContentType.UNKNOWN ? byExt : byMagic;
  }

  // Legacy OLE (doc/xls/ppt) all share one magic number. Keep the extension's
  // MIME when the extension already identified it as a document.
  if (byMagic.mime === 'application/x-ole-storage' && byExt.type === ContentType.DOCUMENT) {
    return { ...byMagic, mime: byExt.mime };
  }

  // Otherwise trust the bytes.
  return byMagic;
}

/**
 * Convenience: classify by name only, no byte reading. Useful for a fast first
 * pass or for environments where file contents are not available.
 * @param {string} name
 * @returns {import('./types.js').ClassificationResult}
 */
export function classifyNameOnly(name) {
  return classifyByExtension(name);
}

export { ContentType, Confidence };
