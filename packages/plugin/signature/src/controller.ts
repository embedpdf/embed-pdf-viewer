/**
 * The signature controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here — every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';
import type { SignatureConfig } from './contract';
import type { SignatureHostCapability } from './host-contract';
import { createSignatureReads } from './read/signatures';
import { createServices, type SignatureContext } from './services';
import { subscribeDocumentEvents } from './sync/document-events';
import { createHydration } from './sync/hydration';
import { createFills } from './write/fill';
import { createPlacement, createTarget } from './write/place';
import { createSigning } from './write/sign';

function build(ctx: SignatureContext, config: SignatureConfig) {
  const services = createServices(ctx, config);
  const { events, authority } = services;

  // Reads: pure projections of the slice.
  const reads = createSignatureReads(services);

  // Sync: the engine's facts into the slice.
  const hydration = createHydration(ctx, services, config, reads);

  // Writes: the sign-here target, sealing, visual fills, the destination rule.
  const target = createTarget(ctx, services);
  const signing = createSigning(ctx, services, hydration, target);
  const fills = createFills(ctx, services, reads, target);
  const placement = createPlacement(services, config, signing, fills);

  const api = composeApi('signature', [
    reads.api,
    hydration.api,
    target.api,
    signing.api,
    fills.api,
    placement.api,
    {
      // Authority twins and the change hooks are services, not areas.
      canSign: authority.canSign,
      canFill: authority.canFill,
      canCertify: authority.canCertify,
      onSigned: events.signed.on,
      onFilled: events.filled.on,
      onCleared: events.cleared.on,
      onValidated: events.validated.on,
      onProtectionChanged: events.protectionChanged.on,
      onInvalidating: events.invalidating.on,
      onTargetChanged: events.targetChanged.on,
      onSignRequested: events.signRequested.on,
      onInspectionRequested: events.inspectionRequested.on,
    },
  ]) satisfies SignatureHostCapability;
  return { api, hydration };
}

export function createSignatureController(
  ctx: SignatureContext,
  config: SignatureConfig = {},
): { api: SignatureHostCapability; connect(): void } {
  const { api, hydration } = build(ctx, config);
  return {
    api,
    connect() {
      subscribeDocumentEvents(ctx, hydration);
      void hydration
        .refresh()
        .then((snapshot) =>
          snapshot?.signatures.some((s) => s.signed) ? hydration.validate() : null,
        )
        .catch((error) => globalThis.console?.error('[signature] initial read failed:', error));
    },
  };
}

/** The capability with its document-event subscription and no initial read — the shape the unit tests build. */
export function createSignatureCapability(
  ctx: SignatureContext,
  config: SignatureConfig = {},
): SignatureHostCapability {
  const { api, hydration } = build(ctx, config);
  subscribeDocumentEvents(ctx, hydration);
  return api;
}
