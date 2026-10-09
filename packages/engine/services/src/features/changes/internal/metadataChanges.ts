import {
  authorizeCapability,
  type ChangeOp,
  type CustomMetadataPatch,
  type MetadataPatch,
  type PdfCoordinates,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { assertExpected, leftAlone, type ChangeContext, type Done } from './changeContext';
import { valuesEqual } from '../../../shared/valuesEqual';
import { MetadataMutator } from '../../metadata/MetadataMutator';
import { MetadataReader } from '../../metadata/MetadataReader';
import type { MetadataRevertStep } from '../ChangeRecord';

type Op<T extends ChangeOp['type']> = Extract<
  ChangeOp<PdfCoordinates, WireAnnotationResources>,
  { type: T }
>;

/** `metadata.update`; its reverse puts back each entry still holding what it set. */
export function updateMetadata(
  ctx: ChangeContext,
  op: Op<'metadata.update'>,
  opIndex: number,
): Done {
  authorizeCapability(ctx.authority, 'doc.metadata.modify');
  const before = new MetadataReader(ctx.runtime, ctx.session).read(ctx.signal);
  assertExpected(opIndex, before, op.expect);
  const result = new MetadataMutator(ctx.runtime, ctx.session).update(op.patch, ctx.signal);
  return {
    item: { type: 'metadata.update', ...result },
    reverse: [revertOf('metadata.update', Object.keys(op.patch), before, result.metadata)],
  };
}

/** `metadata.updateCustom`; its reverse puts back each key still holding what it set. */
export function updateCustomMetadata(ctx: ChangeContext, op: Op<'metadata.updateCustom'>): Done {
  authorizeCapability(ctx.authority, 'doc.metadata.modify');
  const before = new MetadataReader(ctx.runtime, ctx.session).readCustom(ctx.signal);
  const result = new MetadataMutator(ctx.runtime, ctx.session).updateCustom(op.patch, ctx.signal);
  return {
    item: { type: 'metadata.updateCustom', ...result },
    reverse: [revertOf('metadata.updateCustom', Object.keys(op.patch), before, result.custom)],
  };
}

/** Puts back each entry still holding what the change set; the rest are left alone. */
export function revertMetadata(ctx: ChangeContext, step: MetadataRevertStep): Done {
  authorizeCapability(ctx.authority, 'doc.metadata.modify');
  const reader = new MetadataReader(ctx.runtime, ctx.session);
  const current: object =
    step.op === 'metadata.update' ? reader.read(ctx.signal) : reader.readCustom(ctx.signal);
  const left = step.left as Record<string, unknown>;
  const keys = Object.keys(left);
  const kept = keys.filter((key) => valuesEqual(entryOf(current, key), left[key]));
  if (kept.length === 0) return leftAlone(ctx, step.op);
  const restore = pick(step.restore, kept);
  const mutator = new MetadataMutator(ctx.runtime, ctx.session);
  const skipped = keys.filter((key) => !kept.includes(key));
  const reverse: MetadataRevertStep = {
    kind: 'metadata.revert',
    op: step.op,
    restore: pick(step.left, kept),
    left: restore,
  };
  if (step.op === 'metadata.update') {
    const result = mutator.update(restore as MetadataPatch, ctx.signal);
    return {
      item: { type: 'metadata.update', ...result, ...(skipped.length > 0 ? { skipped } : {}) },
      reverse: [reverse],
    };
  }
  const result = mutator.updateCustom(restore as CustomMetadataPatch, ctx.signal);
  return {
    item: { type: 'metadata.updateCustom', ...result, ...(skipped.length > 0 ? { skipped } : {}) },
    reverse: [reverse],
  };
}

/**
 * The reverse of a metadata write: the entries it changed, their old values
 * (null for a custom key that wasn't there), and the values it left.
 */
function revertOf(
  op: MetadataRevertStep['op'],
  keys: readonly string[],
  before: object,
  after: object,
): MetadataRevertStep {
  const changed = keys.filter((key) => !valuesEqual(entryOf(before, key), entryOf(after, key)));
  return {
    kind: 'metadata.revert',
    op,
    restore: Object.fromEntries(changed.map((key) => [key, entryOf(before, key)])),
    left: Object.fromEntries(changed.map((key) => [key, entryOf(after, key)])),
  };
}

/** An entry's value; a custom key that isn't there reads as null, as a patch removes one. */
function entryOf(values: object, key: string): unknown {
  return (values as Record<string, unknown>)[key] ?? null;
}

function pick(values: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, entryOf(values, key)]));
}
