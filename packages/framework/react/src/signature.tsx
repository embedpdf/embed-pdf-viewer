/**
 * The React view of @embedpdf/plugin-signature: signing for the surrounding
 * document, its state (the signatures with their verdicts, what they allow,
 * the target, a two-step signing in progress), and the one derivation a
 * signatures panel needs: the people (libraries of kind `signatures`) with
 * their marks.
 *
 *   const signature = useSignature();
 *   await signature.placeMark({ assetId }, { field: target }); // sign, fill or ask, by mode
 */
import { useMemo } from 'react';
import type { EventHook } from '@embedpdf/core';
import {
  markRoleOf,
  signatureState,
  SIGNATURES_LIBRARY_KIND,
  SignatureToken,
  type SignatureCapability,
} from '@embedpdf/plugin-signature';
import type { StampAsset, StampLibrary } from '@embedpdf/plugin-stamp/contract';

import { useCapability, useCapabilityEvent } from './runtime';
import { useStampAssets, useStampLibraries } from './stamp';
import { settingsHook, stateHook } from './state';

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-signature';

/** The signature API for the surrounding document. */
export function useSignature(): SignatureCapability {
  return useCapability(SignatureToken);
}

/**
 * The signatures' state: the signed fields with their verdicts, what they
 * allow, the target, whether a signing runs, a two-step signing in progress,
 * and whether they're read (the page's State table, declared once in
 * `signatureState`). Takes a selector, and re-renders only when what it
 * returns changes.
 */
export const useSignatureState = stateHook(signatureState);

/** The signature settings (`key`, `mode`, `trust`, `allowCertify`), with or without a document. Takes a selector. */
export const useSignatureSettings = settingsHook(SignatureToken);

/** Subscribe to one of the plugin's events while mounted: `useSignatureEvent((signature) => signature.onSigned, handler)`. */
export function useSignatureEvent<T>(
  select: (signature: SignatureCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SignatureToken, select, handler);
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
 * The people whose marks this browser holds, one row per library of kind
 * `signatures`, for a picker. Derived from the stamp plugin: rename, delete
 * and export are the library verbs; nothing is stored beyond the file.
 */
export function useSignerRows(): SignerRow[] {
  const libraries = useStampLibraries({ kind: SIGNATURES_LIBRARY_KIND });
  const assets = useStampAssets();
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
