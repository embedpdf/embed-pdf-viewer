/**
 * The signature plugin's service and feature:
 *
 *   withSignature(config)      the plugin, for provideEmbedPdf(), with the key to sign with
 *   inject(EpdfSignature)      sign, fill and check signature fields: `sign()`, `placeMark()`,
 *                              `signatures()`, the events as streams (`invalidationPredicted$`),
 *                              and the people whose marks this browser holds, `signerRows()`
 *
 * Signing needs the form plugin (the fields) and the stamp plugin (a person's marks):
 * `provideEmbedPdf(config, withForm(), withStamp(), withSignature({ key }))`.
 */
import { computed, Injectable, type Signal } from '@angular/core';
import {
  CapabilityBinding,
  injectDocumentScope,
  pluginService,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import {
  signaturePlugin,
  signatureState,
  signerRowsOf,
  SIGNATURES_LIBRARY_KIND,
  SignatureToken,
  type SignatureConfig,
  type SignerRow,
} from '@embedpdf/plugin-signature';
import {
  StampToken,
  type StampAsset,
  type StampLibrary,
} from '@embedpdf/plugin-stamp/contract';

const NO_LIBRARIES: readonly StampLibrary[] = Object.freeze([]);
const NO_ASSETS: readonly StampAsset[] = Object.freeze([]);

/**
 * Signatures: `signatures()`, `protection()`, `target()`, `busy()`, `pending()` and `status()`
 * as signals; signing, filling and checking as methods (`sign()`, `placeMark()`,
 * `fillField()`, `validate()`, …, the Signatures page's Methods table); the events as streams
 * (`signed$`, `invalidationPredicted$`, `targetChanged$`, …); and the settings. Without a
 * document, `signatures()` is empty and a method refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfSignature extends pluginService({
  name: 'EpdfSignature',
  feature: 'withSignature()',
  token: SignatureToken,
  state: signatureState,
  methods: [
    'getSnapshot',
    'getStatus',
    'listSignatures',
    'listUnsignedFields',
    'getSignature',
    'listVerdicts',
    'getVerdict',
    'getProtection',
    'getPending',
    'isBusy',
    'getMode',
    'getTarget',
    'sign',
    'prepareSignature',
    'completeSignature',
    'cancelPending',
    'fillField',
    'clearField',
    'placeMark',
    'setTarget',
    'requestInspection',
    'refresh',
    'validate',
    'validateField',
    'analyzeChanges',
    'readRevision',
    'canSign',
    'canFill',
    'canCertify',
    'canReadRevision',
  ],
  events: [
    'onSigned',
    'onFilled',
    'onCleared',
    'onValidated',
    'onProtectionChanged',
    'onInvalidationPredicted',
    'onTargetChanged',
    'onSignRequested',
    'onInspectionRequested',
  ],
}) {
  /** The stamp plugin, where a person's marks are kept; absent without `withStamp()`. */
  private readonly stamp = new CapabilityBinding(
    this.binding.host,
    () => StampToken,
    injectDocumentScope(),
  );
  private readonly libraries = this.stamp.select(
    (stamp) => stamp.listLibraries({ kind: SIGNATURES_LIBRARY_KIND }),
    NO_LIBRARIES,
  );
  private readonly assets = this.stamp.select((stamp) => stamp.listAssets(), NO_ASSETS);

  /**
   * The people whose marks this browser holds, one row per stamp library of kind
   * `signatures`, each with its signatures and its initials, for a picker. Empty without the
   * stamp plugin. Rename, delete and export a person with the stamp plugin's library methods.
   */
  readonly signerRows: Signal<readonly SignerRow[]> = computed(() =>
    signerRowsOf(this.libraries(), this.assets()),
  );
}

/**
 * The signature plugin, with its settings: the `key` to sign with (a signer, or a function that
 * gives one when someone signs), the `mode`, the certificates you `trust`, and `allowCertify`.
 */
export function withSignature(config?: SignatureConfig): EmbedPdfFeature {
  return { plugins: [signaturePlugin(config)], services: [EpdfSignature] };
}
