import type { PdfDestination } from './PdfDestination';

/**
 * Where a link annotation points, NORMALIZED. A link may carry either a
 * direct `/Dest` or an `/A` action (ISO 32000-1 §12.5.6.5); to a viewer a
 * `/Dest` and a `/A GoTo` are the same intent, so the engine collapses both
 * onto the `goto` arm — clients never see the raw two-shape split (the v2
 * `target.action.destination` double-wrap). Named destinations are resolved
 * to explicit ones engine-side, the same rule {@link PdfDestination}
 * documents.
 *
 * Arm names follow the `PdfActionType` vocabulary (`goto`, `uri`,
 * `goto-remote`, `launch`) so the two action-shaped surfaces never drift.
 *
 * `goto-remote` and `launch` are READ-ONLY in v1: the engine reports them
 * so a client can display/inspect, but never follows or executes them, and
 * refuses to write them (see {@link PdfLinkTargetWritable}). `unsupported`
 * preserves round-trip for action types the reader doesn't model.
 */
export type PdfLinkTarget =
  | { kind: 'goto'; destination: PdfDestination }
  | { kind: 'uri'; uri: string }
  | { kind: 'goto-remote'; file: string }
  | { kind: 'launch'; path: string }
  | { kind: 'unsupported' };

/**
 * The subset of {@link PdfLinkTarget} that drafts/patches may author:
 * in-document destinations and URIs. Keeping `goto-remote`/`launch` out of
 * the WRITE surface is deliberate (executable-shaped actions are a security
 * liability the viewer never needs to author), and `unsupported` carries
 * nothing to write.
 */
export type PdfLinkTargetWritable = Extract<PdfLinkTarget, { kind: 'goto' | 'uri' }>;
