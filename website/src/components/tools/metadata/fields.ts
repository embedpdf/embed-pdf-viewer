import type { DocumentHandle } from '@embedpdf/engine';

/**
 * The metadata tool's plain helpers: the form's values from what the engine reads, the change
 * to send back from what was edited, and the checks. No engine calls and no DOM, so they're
 * tested on their own.
 */

export type Metadata = Awaited<ReturnType<DocumentHandle['metadata']['get']>>;
export type MetadataPatch = Parameters<DocumentHandle['metadata']['update']>[0];
export type Trapped = Metadata['trapped'];

/** The fields as the form holds them: text, `''` for none, dates as local `datetime-local` text. */
export interface FormValues {
  readonly title: string;
  readonly author: string;
  readonly subject: string;
  readonly keywords: string;
  readonly creator: string;
  readonly producer: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly trapped: Trapped;
}

export type TextField = 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer';
export type DateField = 'createdAt' | 'modifiedAt';

const TEXT_FIELDS: readonly TextField[] = [
  'title',
  'author',
  'subject',
  'keywords',
  'creator',
  'producer',
];
const DATE_FIELDS: readonly DateField[] = ['createdAt', 'modifiedAt'];

/** What "Remove personal details" empties: who made the file and with what, and its keywords. */
export const PERSONAL_FIELDS: readonly TextField[] = ['author', 'keywords', 'creator', 'producer'];

const pad = (value: number) => String(value).padStart(2, '0');

/** An ISO date as a `datetime-local` field shows it, in this device's time, to the second. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** A `datetime-local` value as a date (it's local time), `null` when empty or not a date. */
export function fromLocalInput(text: string): Date | null {
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formValues(metadata: Metadata): FormValues {
  return {
    title: metadata.title ?? '',
    author: metadata.author ?? '',
    subject: metadata.subject ?? '',
    keywords: metadata.keywords ?? '',
    creator: metadata.creator ?? '',
    producer: metadata.producer ?? '',
    createdAt: toLocalInput(metadata.createdAt),
    modifiedAt: toLocalInput(metadata.modifiedAt),
    trapped: metadata.trapped,
  };
}

/**
 * The change to send: only the fields that differ from what was read. An emptied field is
 * removed (`null`), not set to an empty string, so a reader falls back to its default (the file
 * name for an empty title).
 */
export function metadataPatch(original: FormValues, draft: FormValues): MetadataPatch {
  const patch: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (draft[field] !== original[field]) patch[field] = draft[field].trim() ? draft[field] : null;
  }
  for (const field of DATE_FIELDS) {
    if (draft[field] !== original[field]) patch[field] = fromLocalInput(draft[field]);
  }
  if (draft.trapped !== original.trapped) patch.trapped = draft.trapped;
  return patch as MetadataPatch;
}

/** A field of its own an app added, as one row of the form. */
export interface CustomRow {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}

/** The standard fields' own names, which a key of one's own can't take. */
const STANDARD_KEYS = new Set([
  'title',
  'author',
  'subject',
  'keywords',
  'creator',
  'producer',
  'creationdate',
  'moddate',
  'trapped',
]);

/** What's wrong with a key, in words, or `null` when it's fine. */
export function customKeyProblem(key: string, otherKeys: readonly string[]): string | null {
  const trimmed = key.trim();
  if (!trimmed) return 'Give the field a name.';
  if (trimmed.length > 127) return 'Use a name of 127 characters or fewer.';
  if (!/^[\x21-\x7e]+$/.test(trimmed)) {
    return 'Use letters, digits and punctuation, without spaces or accents.';
  }
  if (trimmed.startsWith('/')) return 'The name can’t start with a slash.';
  if (STANDARD_KEYS.has(trimmed.toLowerCase())) return 'That name is one of the fields above.';
  if (otherKeys.includes(trimmed)) return 'Another field has this name.';
  return null;
}

/**
 * The change to the fields of one's own: removed keys go (`null`), new and changed ones are set.
 * A renamed key is the old one removed and the new one set. Rows without a name are left out.
 */
export function customPatch(
  original: Readonly<Record<string, string>>,
  rows: readonly CustomRow[],
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  const kept = new Map(
    rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
  );
  for (const key of Object.keys(original)) if (!kept.has(key)) patch[key] = null;
  for (const [key, value] of kept) if (original[key] !== value) patch[key] = value;
  return patch;
}

/**
 * Whether the file also carries its details as XMP, the second copy some readers prefer. The
 * engine changes only the document information, so the tool says when this copy exists. XMP is
 * written as plain text so any app can find it, which is how it's found here.
 */
export function hasXmp(bytes: Uint8Array): boolean {
  const marker = new TextEncoder().encode('<x:xmpmeta');
  outer: for (let index = 0; index + marker.length <= bytes.length; index++) {
    for (let offset = 0; offset < marker.length; offset++) {
      if (bytes[index + offset] !== marker[offset]) continue outer;
    }
    return true;
  }
  return false;
}
