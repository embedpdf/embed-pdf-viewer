/**
 * The document's own Info-dict keys: every key but the standard ones
 * ({@link DocumentMetadata}), as `{ key: value }`, and `{}` when there are
 * none. The keys are the PDF's own names (`reviewedBy` is `/reviewedBy`).
 */
export type CustomMetadata = Record<string, string>;
