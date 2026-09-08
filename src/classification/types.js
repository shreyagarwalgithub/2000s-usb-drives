/**
 * Content categories the classifier can assign to a file.
 *
 * These are intentionally coarse. Iteration 1 only needs to sort a drive into
 * broad buckets so that later iterations can attach per-category "actions"
 * (video quality + OTT check, image content detection, code README generation).
 */
export const ContentType = Object.freeze({
  VIDEO: 'video',
  IMAGE: 'image',
  AUDIO: 'audio',
  CODE: 'code',
  DOCUMENT: 'document',
  ARCHIVE: 'archive',
  EXECUTABLE: 'executable',
  DISK_IMAGE: 'disk-image',
  FONT: 'font',
  DATA: 'data',
  OTHER: 'other',
  UNKNOWN: 'unknown',
});

/**
 * Human-readable labels for each category, used by the UI.
 */
export const ContentTypeLabel = Object.freeze({
  [ContentType.VIDEO]: 'Video',
  [ContentType.IMAGE]: 'Image',
  [ContentType.AUDIO]: 'Audio',
  [ContentType.CODE]: 'Code',
  [ContentType.DOCUMENT]: 'Document',
  [ContentType.ARCHIVE]: 'Archive',
  [ContentType.EXECUTABLE]: 'Executable',
  [ContentType.DISK_IMAGE]: 'Disk image',
  [ContentType.FONT]: 'Font',
  [ContentType.DATA]: 'Data',
  [ContentType.OTHER]: 'Other',
  [ContentType.UNKNOWN]: 'Unknown',
});

/**
 * Confidence levels a classification engine can report.
 * MAGIC beats EXTENSION when they disagree, because reading the bytes is more
 * reliable than trusting a (possibly wrong or missing) file extension.
 */
export const Confidence = Object.freeze({
  MAGIC: 'magic-number',
  EXTENSION: 'extension',
  NONE: 'none',
});

/**
 * Finer-grained sub-types for the DOCUMENT category. A drive of office files
 * collapses into one giant "document" bucket otherwise, which is not actionable
 * (see the real-world scan reports). These let the summary show PDFs vs.
 * spreadsheets vs. presentations, etc.
 */
export const DocumentSubtype = Object.freeze({
  PDF: 'pdf',
  WORD: 'word',
  SPREADSHEET: 'spreadsheet',
  PRESENTATION: 'presentation',
  EBOOK: 'ebook',
  TEXT: 'text',
  OTHER: 'other-document',
});

/** Human-readable labels for document sub-types. */
export const DocumentSubtypeLabel = Object.freeze({
  [DocumentSubtype.PDF]: 'PDF',
  [DocumentSubtype.WORD]: 'Word',
  [DocumentSubtype.SPREADSHEET]: 'Spreadsheet',
  [DocumentSubtype.PRESENTATION]: 'Presentation',
  [DocumentSubtype.EBOOK]: 'E-book',
  [DocumentSubtype.TEXT]: 'Text',
  [DocumentSubtype.OTHER]: 'Other document',
});

/**
 * Map a MIME type to a document sub-type. Returns null when the MIME isn't a
 * recognized document format (the caller leaves subtype undefined then).
 * @param {string} [mime]
 * @returns {string|null}
 */
export function documentSubtypeForMime(mime) {
  if (!mime) return null;
  const m = mime.toLowerCase();

  if (m === 'application/pdf') return DocumentSubtype.PDF;

  if (
    m === 'application/msword' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'application/vnd.oasis.opendocument.text' ||
    m === 'application/rtf' ||
    m === 'application/x-iwork-pages-sffpages'
  ) {
    return DocumentSubtype.WORD;
  }

  if (
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    m === 'application/vnd.oasis.opendocument.spreadsheet'
  ) {
    return DocumentSubtype.SPREADSHEET;
  }

  if (
    m === 'application/vnd.ms-powerpoint' ||
    m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return DocumentSubtype.PRESENTATION;
  }

  if (
    m === 'application/epub+zip' ||
    m === 'application/x-mobipocket-ebook'
  ) {
    return DocumentSubtype.EBOOK;
  }

  if (m === 'text/plain' || m === 'text/markdown') {
    return DocumentSubtype.TEXT;
  }

  return DocumentSubtype.OTHER;
}

/**
 * @typedef {Object} ClassificationResult
 * @property {string} type        One of ContentType.
 * @property {string} detectedBy  One of Confidence (how the type was decided).
 * @property {string} [mime]      Best-guess MIME type, if known.
 * @property {string} [subtype]   For DOCUMENT: one of DocumentSubtype.
 */
