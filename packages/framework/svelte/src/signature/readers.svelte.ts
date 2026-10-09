/**
 * The signature plugin's readers: `useSignature()` (the API), the state and the settings,
 * `useSignatureEvent()`, and `useSignerRows()`, the people whose marks this browser holds, for a
 * signature picker.
 */
import type { EventHook } from '@embedpdf/core';
import {
  signatureState,
  signerRowsOf,
  SIGNATURES_LIBRARY_KIND,
  SignatureToken,
} from '@embedpdf/plugin-signature';
import type { SignatureCapability, SignerRow } from '@embedpdf/plugin-signature';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { settingsReader, stateReader, type StateReader } from '../runtime/state.svelte';
import { currentOf, derivedValue, type CurrentValue } from '../runtime/values.svelte';
import { useStampAssets, useStampLibraries } from '../stamp/readers.svelte';

/**
 * The signature API for the document in scope: sign, place a mark, fill or clear a field, check
 * the signatures. A handle: keep it whole and call through it (`signature.sign(…)`).
 */
export function useSignature(): SignatureCapability {
  return useCapability(SignatureToken);
}

/**
 * The signatures' state: the signed fields with their verdicts (`signatures`), what they allow,
 * the `target`, whether a signing runs (`busy`), a two-step signing in progress, and whether
 * they're read, declared once in `signatureState`. A reactive object (`state.signatures`), or
 * with a selector one value as `{ current }`. Empty without a document.
 *
 * Typed through the declaration, so the published types name it from `@embedpdf/plugin-signature`, a
 * dependency of this package, and not from the engine package `protection`'s type comes from, which
 * isn't one.
 */
export const useSignatureState: StateReader<ReturnType<typeof signatureState.read>> =
  stateReader(signatureState);

/**
 * The signature settings (`key`, `mode`, `trust`, `allowCertify`), with or without a document.
 * They belong to the plugin; change them with `useSignature().updateSettings()`.
 */
export const useSignatureSettings = settingsReader(SignatureToken);

/**
 * Subscribe to one signature event while the component lives:
 * `useSignatureEvent((signature) => signature.onSigned, handler)`.
 */
export function useSignatureEvent<T>(
  select: (signature: SignatureCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SignatureToken, select, handler);
}

/**
 * The people whose marks this browser holds, one row per library of kind `signatures`, for a
 * picker, as `{ current }`: `const rows = useSignerRows()`, then `rows.current`. Derived from the
 * stamp plugin, so it needs `stampPlugin()`: rename, delete and export are the library verbs, and
 * nothing is stored beyond the file.
 */
export function useSignerRows(): CurrentValue<readonly SignerRow[]> {
  const libraries = useStampLibraries({ kind: SIGNATURES_LIBRARY_KIND });
  const assets = useStampAssets();
  return currentOf(derivedValue(() => signerRowsOf(libraries.current, assets.current)));
}
