import { ContentType } from '../types.js';

/**
 * Per-content-type "actions".
 *
 * ITERATION 1 SCOPE: classification only. This registry exists so that later
 * iterations can attach deeper, type-specific analysis without touching the
 * scanner or classifier. In v1 every action is a documented stub that reports
 * "not implemented yet".
 *
 * An action takes a classified file and returns some enrichment about it. The
 * exact return shape is defined per action as it is built out; see
 * ./README.md for the planned behavior of each.
 *
 * @typedef {Object} ActionContext
 * @property {string} name        File name.
 * @property {string} path        Full relative path.
 * @property {number} size        Size in bytes.
 * @property {string} mime        Detected MIME type.
 * @property {() => Promise<File>} getFile  Lazily resolves the File object.
 *
 * @typedef {Object} ActionResult
 * @property {boolean} implemented Whether the action actually ran.
 * @property {string} summary     Human-readable outcome.
 * @property {Object} [data]      Structured, action-specific data.
 *
 * @callback Action
 * @param {ActionContext} ctx
 * @returns {Promise<ActionResult>}
 */

/** Build a placeholder action that reports it is not implemented yet. */
function notImplemented(label) {
  /** @type {Action} */
  return async () => ({
    implemented: false,
    summary: `${label} is planned for a future iteration (classification-only in v1).`,
  });
}

/**
 * Maps each content type to its action handler.
 * Replace a stub with a real implementation to enable that action.
 *
 * @type {Record<string, Action>}
 */
export const actionRegistry = {
  // Planned: probe resolution/bitrate for a quality estimate, check whether the
  // title is available on an OTT platform, then flag delete (available) vs.
  // preserve (not available).
  [ContentType.VIDEO]: notImplemented('Video quality + OTT availability check'),

  // Planned: run an in-browser object/scene detection model to describe the
  // image contents.
  [ContentType.IMAGE]: notImplemented('Image content detection'),

  // Planned: generate a README summarizing what a code folder is about.
  [ContentType.CODE]: notImplemented('Code folder README generation'),

  // Remaining types have no planned action yet.
  [ContentType.AUDIO]: notImplemented('Audio action'),
  [ContentType.DOCUMENT]: notImplemented('Document action'),
  [ContentType.ARCHIVE]: notImplemented('Archive action'),
};

/**
 * Look up the action for a content type, or null if none is registered.
 * @param {string} type One of ContentType.
 * @returns {Action|null}
 */
export function getAction(type) {
  return actionRegistry[type] || null;
}

/**
 * Run the registered action for a classified file, if any.
 * @param {string} type One of ContentType.
 * @param {ActionContext} ctx
 * @returns {Promise<ActionResult|null>} null if no action is registered.
 */
export async function runAction(type, ctx) {
  const action = getAction(type);
  if (!action) return null;
  return action(ctx);
}
