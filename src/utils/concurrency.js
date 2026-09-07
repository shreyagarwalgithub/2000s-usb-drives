/**
 * Run an async task over items with a bounded number of concurrent workers.
 *
 * A huge drive can hold hundreds of thousands of files. Processing them all at
 * once would exhaust memory and freeze the tab. This runs a fixed-size pool of
 * workers that pull from a shared cursor, keeping memory flat and the UI
 * responsive.
 *
 * @template T
 * @param {AsyncIterable<T>|Iterable<T>} items Source of work items.
 * @param {(item: T) => Promise<void>} worker  Async handler for each item.
 * @param {Object} [options]
 * @param {number} [options.concurrency=8]      Number of parallel workers.
 * @param {() => boolean} [options.shouldStop]  Return true to stop early.
 * @returns {Promise<void>}
 */
export async function runPool(items, worker, options = {}) {
  const { concurrency = 8, shouldStop } = options;
  const iterator =
    Symbol.asyncIterator in Object(items)
      ? items[Symbol.asyncIterator]()
      : items[Symbol.iterator]();

  let done = false;

  async function next() {
    while (!done) {
      if (shouldStop && shouldStop()) {
        done = true;
        return;
      }
      const { value, done: iterDone } = await iterator.next();
      if (iterDone) {
        done = true;
        return;
      }
      await worker(value);
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(next());
  }
  await Promise.all(workers);
}

/**
 * Yield control back to the event loop so the UI can paint.
 * @returns {Promise<void>}
 */
export function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
