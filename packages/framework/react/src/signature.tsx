/**
 * The React view of @embedpdf/plugin-signature: the act of signing for the
 * surrounding `DocumentScope`, its live facts (snapshot, verdicts,
 * protection, target), and the one derivation a signatures panel needs —
 * the people (libraries of kind `signatures`) with their marks.
 *
 *   const signature = useSignature();
 *   await signature.placeMark({ assetId }, { field: target });   // sign / fill / ask, by mode
 */
import { useMemo } from 'react';
import {
  markRoleOf,
  SIGNATURES_LIBRARY_KIND,
  SignatureToken,
  type DocumentProtection,
  type FormFieldRef,
  type SignatureCapability,
  type SignatureChange,
  type SignatureSnapshot,
  type SignatureVerdict,
} from '@embedpdf/plugin-signature';
import { StampToken, type StampAsset, type StampLibrary } from '@embedpdf/plugin-stamp/contract';

import { shallowArray, useCapability, useCapabilityEvent, useSelector } from './runtime';
import { useStampLibraries } from './stamp';

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-signature';

/** The signature capability for the surrounding document. */
export function useSignature(): SignatureCapability {
  return useCapability(SignatureToken);
}

/** The last signature snapshot (null until the first read lands). */
export function useSignatureSnapshot(): SignatureSnapshot | null {
  return useSelector(SignatureToken, (c) => c.snapshot());
}

/** The last validation (null until one ran). */
export function useSignatureVerdicts(): SignatureVerdict[] | null {
  return useSelector(SignatureToken, (c) => c.verdicts());
}

/** What the document's signatures forbid (null when nothing is signed or not yet read). */
export function useDocumentProtection(): DocumentProtection | null {
  return useSelector(SignatureToken, (c) => c.protection());
}

/** The field the next picked mark goes to, and whether a sign/fill is in flight. */
export function useSignatureTarget(): { target: FormFieldRef | null; busy: boolean } {
  const target = useSelector(SignatureToken, (c) => c.target());
  const busy = useSelector(SignatureToken, (c) => c.busy());
  return { target, busy };
}

/** Subscribe to the plugin's change events (signed / filled / ask / inspect / target / validated …). */
export function useSignatureEvent(handler: (event: SignatureChange) => void): void {
  useCapabilityEvent(SignatureToken, (c) => c.onChanged, handler);
}

/** One person: a library of kind `signatures` with its marks split by role. */
export interface SignerRow {
  libraryId: string;
  name: string;
  library: StampLibrary;
  signatures: StampAsset[];
  initials: StampAsset | null;
}

/**
 * The people whose marks this browser holds — one row per library of kind
 * `signatures`. Purely derived from the stamp plugin: rename, delete, and
 * export are the library verbs; nothing is stored beyond the file.
 */
export function useSignerRows(): SignerRow[] {
  const libraries = useStampLibraries({ kind: SIGNATURES_LIBRARY_KIND });
  const assets = useSelector(StampToken, (c) => c.listAssets(), shallowArray);
  return useMemo(
    () =>
      libraries.map((library) => {
        const own = assets.filter((asset) => asset.libraryId === library.id);
        return {
          libraryId: library.id,
          name: library.name,
          library,
          signatures: own.filter((asset) => markRoleOf(asset) === 'signature'),
          initials: own.find((asset) => markRoleOf(asset) === 'initials') ?? null,
        };
      }),
    [libraries, assets],
  );
}
