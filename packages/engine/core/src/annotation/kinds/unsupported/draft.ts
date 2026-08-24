/**
 * Drafts for unsupported subtypes are not allowed: clients must use a
 * dedicated kind. The type exists so the union is total.
 */
export type UnsupportedDraft = never;
