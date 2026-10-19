/**
 * What a test page tells its test: one record, `window.__viewerCheck`, that the page fills in
 * and the test reads with `page.evaluate`. Each page names its record's shape in one exported
 * interface, which its test reads it as.
 */
declare global {
  interface Window {
    __viewerCheck?: unknown;
  }
}

/** Make `record` the page's record, and give it back to fill in. */
export function checkRecord<Record extends object>(record: Record): Record {
  window.__viewerCheck = record;
  return record;
}
