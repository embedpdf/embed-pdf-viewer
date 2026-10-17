/**
 * The signature composables: `useSignature()` (the API), the state and the
 * settings as refs, `useSignatureEvent()`, and `useSignerRows()`, the people
 * whose marks this browser holds, for a signature picker.
 */
import { computed } from 'vue';
import type { Ref } from 'vue';
import type { EventHook } from '@embedpdf/core';
import {
  signatureState,
  signerRowsOf,
  SIGNATURES_LIBRARY_KIND,
  SignatureToken,
} from '@embedpdf/plugin-signature';
import type { SignatureCapability, SignerRow } from '@embedpdf/plugin-signature';
import { useCapability, useCapabilityEvent } from '../runtime/capabilities';
import { useStampAssets, useStampLibraries } from '../stamp';
import { settingsComposable, stateComposable } from '../state';
import type { StateComposable } from '../state';

/**
 * The signature API for the document in scope: sign, place a mark, fill or
 * clear a field, check the signatures. The object never changes, so it's
 * safe to keep in a closure; keep it whole (`signature.sign(…)`), since a
 * member taken out of it once stays the one of that moment.
 */
export function useSignature(): SignatureCapability {
  return useCapability(SignatureToken);
}

/**
 * The signatures' state as refs: the signed fields with their verdicts
 * (`signatures`), what they allow, the `target`, whether a signing runs
 * (`busy`), a two-step signing in progress, and whether they're read,
 * declared once in `signatureState`. With a selector, one ref that updates
 * only when the value it picks changes. Empty without a document.
 *
 * Typed through the declaration, so the published types name it from
 * `@embedpdf/plugin-signature`, a dependency of this package, and not from the
 * engine package `protection`'s type comes from, which isn't one.
 */
export const useSignatureState: StateComposable<ReturnType<typeof signatureState.read>> =
  stateComposable(signatureState);

/**
 * The signature settings (`key`, `mode`, `trust`, `allowCertify`) as refs, or
 * one ref for the value `select` picks. They belong to the plugin, so they
 * read without a document.
 */
export const useSignatureSettings = settingsComposable(SignatureToken);

/** Subscribe to one signature event while the component lives: `useSignatureEvent((signature) => signature.onSigned, handler)`. */
export function useSignatureEvent<Event>(
  select: (signature: SignatureCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(SignatureToken, select, handler);
}

/**
 * The people whose marks this browser holds, one row per library of kind
 * `signatures`, for a picker, as a ref: `const rows = useSignerRows()`.
 * Derived from the stamp plugin, so it needs `stampPlugin()`: rename, delete
 * and export are the library verbs, and nothing is stored beyond the file.
 */
export function useSignerRows(): Readonly<Ref<readonly SignerRow[]>> {
  const libraries = useStampLibraries({ kind: SIGNATURES_LIBRARY_KIND });
  const assets = useStampAssets();
  return computed(() => signerRowsOf(libraries.value, assets.value));
}
