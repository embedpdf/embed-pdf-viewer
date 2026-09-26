/**
 * Acrobat's stamp-library convention, interpreted in one place. A library is
 * a PDF whose `/Names /Pages` registry names each stamp page with a key of
 * the form `identifier=label`:
 *
 *   - `identifier` (before the first `=`) is the stamp's durable identity
 *     and becomes the placed annotation's `/Name` — a standard name such as
 *     `Approved`, or a custom one such as Acrobat's `#LBGiYhk8V_oAfmqAPENiwD`;
 *   - `label` (after it) is what the picker shows and the placed
 *     annotation's default `/Subj`.
 *
 * The engine never interprets key text; this module does. A key without
 * `=` is its own label. `#` is never stripped: it is part of the identity.
 */
import type { PieceInfoPatch } from '@embedpdf/engine-core/runtime';
import type { StampAssetKind } from './contract';

export interface StampKey {
  name: string;
  label: string;
}

export function parseStampKey(key: string): StampKey {
  const separator = key.indexOf('=');
  if (separator < 0) return { name: key, label: key };
  return { name: key.slice(0, separator), label: key.slice(separator + 1) };
}

export function stampKey(name: string, label: string): string {
  return `${name}=${label}`;
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A fresh identifier for a stamp authored here, in Acrobat's own shape
 * (`#` + 22 base-62 characters) so a stamp created in this viewer keeps its
 * identity when the library is opened and placed in Acrobat.
 */
export function customStampName(random: () => number = Math.random): string {
  let name = '#';
  for (let i = 0; i < 22; i++) name += BASE62[Math.floor(random() * BASE62.length)];
  return name;
}

/** Asset ids are derived, not allocated: library id + identifier. */
export function assetIdFor(libraryId: string, name: string): string {
  return `${libraryId}:${name}`;
}

// ── PieceInfo: only what has no standard home ────────────────────────────────
//
// The title, the registry, and the artwork are standard PDF. What remains
// (a durable library id, categories, a locale, a stamp's kind and an explicit
// `/Subj` override) rides `/PieceInfo` under these application names, in the
// shape below, so every write produces the dictionary the import reads.

/** Catalog `/PieceInfo` application name for library-level data. */
export const STAMP_LIBRARY_PIECEINFO_APP = 'EMBD_StampLibrary';
/** Page `/PieceInfo` application name for per-stamp data. */
export const STAMP_PIECEINFO_APP = 'EMBD_Stamp';
/** The PieceInfo format version both dictionaries carry in `Version`. */
export const STAMP_PIECEINFO_VERSION = 2;

/** The library kind every file has unless it says otherwise. */
export const DEFAULT_LIBRARY_KIND = 'stamps';

/** `/Kind` names: the two the plugin defines keep their PDF spellings; others are written as given. */
export function libraryKindToPdfName(kind: string): string {
  return kind === 'stamps' ? 'StampLibrary' : kind === 'signatures' ? 'SignatureLibrary' : kind;
}

export function libraryKindFromPdfName(name: string | undefined): string {
  if (!name || name === 'StampLibrary') return DEFAULT_LIBRARY_KIND;
  return name === 'SignatureLibrary' ? 'signatures' : name;
}

export function stampKindToPdfName(kind: StampAssetKind): string {
  return kind === 'signature' ? 'Signature' : kind === 'initials' ? 'Initials' : 'Stamp';
}

/** The catalog patch: library id, categories, locale. The name is `/Title`. */
export function stampLibraryPieceInfo(
  id: string,
  options: { kind?: string; categories?: readonly string[]; locale?: string } = {},
): PieceInfoPatch {
  return {
    Version: STAMP_PIECEINFO_VERSION,
    Id: id,
    Kind: { name: libraryKindToPdfName(options.kind ?? DEFAULT_LIBRARY_KIND) },
    // Format version 2 keeps the name in the PDF's /Title.
    Name: null,
    Categories: options.categories ?? null,
    Locale: options.locale ?? null,
  };
}

/** The page patch: kind, an explicit `/Subj` override, categories. */
export function stampPieceInfo(
  kind: StampAssetKind,
  options: { subject?: string | null; categories?: readonly string[] } = {},
): PieceInfoPatch {
  return {
    Version: STAMP_PIECEINFO_VERSION,
    Kind: { name: stampKindToPdfName(kind) },
    // Format version 2 keeps the identifier and label in the /Names /Pages
    // key; only an explicit /Subj override has no standard home. The format
    // version 1 `Name`/`Subject` keys are cleared, so a re-imported format
    // version 1 library cannot disagree with its registry.
    Name: null,
    Subject: null,
    SubjectOverride: options.subject ?? null,
    Categories: options.categories ?? null,
  };
}
