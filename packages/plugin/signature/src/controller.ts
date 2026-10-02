/**
 * The signature controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here: every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';

import { connectSiblings } from './connect';
import type { SignatureCapability } from './contract';
import { createJudging } from './read/judging';
import { createSignatureReads } from './read/signatures';
import { createServices, type SignatureContext } from './services';
import { createSignaturesMirror } from './sync/signatures';
import { createValidation } from './sync/validation';
import { createFills } from './write/fill';
import { createPlacement, createTarget } from './write/place';
import { createSigning } from './write/sign';

export function createSignatureController(ctx: SignatureContext) {
  const services = createServices(ctx);
  const { events, authority } = services;
  const settings = ctx.settings();

  // Sync: the engine's facts, mirrored, and the judgement that reacts to them.
  const validation = createValidation(ctx, services);
  const signatures = createSignaturesMirror(ctx, services, validation);

  // Reads: projections of the mirror and the session state.
  const reads = createSignatureReads(ctx, services, signatures.mirror);
  const judging = createJudging(ctx, services, validation, signatures.mirror, reads);

  // Writes: the sign-here target, sealing, visual fills, the destination rule.
  const target = createTarget(ctx, services, reads);
  const signing = createSigning(ctx, services, reads, target, signatures);
  const fills = createFills(ctx, services, reads, target);
  const placement = createPlacement(ctx, services, reads, signing, fills);

  const api: SignatureCapability = composeApi('signature', [
    settings.api,
    reads.api,
    judging.api,
    target.api,
    signing.api,
    fills.api,
    placement.api,
    {
      // Authority twins and the events are services, not areas.
      canSign: authority.canSign,
      canFill: authority.canFill,
      canCertify: authority.canCertify,
      canReadRevision: authority.canReadRevision,
      onSigned: events.signed.on,
      onFilled: events.filled.on,
      onCleared: events.cleared.on,
      onValidated: events.validated.on,
      onProtectionChanged: events.protectionChanged.on,
      onInvalidationPredicted: events.invalidationPredicted.on,
      onTargetChanged: events.targetChanged.on,
      onSignRequested: events.signRequested.on,
      onInspectionRequested: events.inspectionRequested.on,
    },
  ]);

  return {
    api,
    connect(): void {
      signatures.connect();
      connectSiblings(ctx, api);
    },
  };
}
