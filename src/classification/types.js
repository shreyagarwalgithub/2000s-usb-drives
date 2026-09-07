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
 * @typedef {Object} ClassificationResult
 * @property {string} type       One of ContentType.
 * @property {string} detectedBy One of Confidence (how the type was decided).
 * @property {string} [mime]     Best-guess MIME type, if known.
 */
