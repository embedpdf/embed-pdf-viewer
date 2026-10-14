import type { PageDestination } from './PdfDestination';

/**
 * Where a link annotation points, normalized. A link may carry either a
 * direct `/Dest` or an `/A` action (ISO 32000-1 §12.5.6.5); to a viewer a
 * `/Dest` and a `/A GoTo` are the same intent, so the engine collapses both
 * onto the `goto` arm — clients never see the raw two-shape split (a
 * `target.action.destination` double-wrap). Named destinations are resolved
 * to explicit ones engine-side, the same rule {@link PageDestination}
 * documents.
 *
 * Arm names follow the `PdfActionType` vocabulary (`goto`, `uri`,
 * `goto-remote`, `launch`, `javascript`) so the two action-shaped surfaces
 * never drift.
 *
 * `goto-remote`, `launch`, and `javascript` are read-only in v1: the
 * engine reports them so a client can display/inspect (or, for
 * `javascript`, hand the link to the scripting orchestrator), but never
 * follows or executes them here, and refuses to write them (see
 * {@link PdfLinkTargetWritable}). `javascript` deliberately carries no
 * script payload — the text already rides the base
 * `actions.activate` model, which is the scripting plane's single home
 * for action scripts. `unsupported` preserves round-trip for action
 * types the reader doesn't model. A `goto` goes to a {@link PageDestination};
 * the engine's readers use `PdfLinkTarget<PdfDestination>`.
 */
export type PdfLinkTarget<Destination = PageDestination> =
  | { kind: 'goto'; destination: Destination }
  | { kind: 'uri'; uri: string }
  | { kind: 'goto-remote'; file: string }
  | { kind: 'launch'; path: string }
  | { kind: 'javascript' }
  /** `/S /Named` — a viewer verb (`NextPage`, `PrevPage`, `FirstPage`,
   *  `LastPage`, …), as the file names it; common in TOC/nav links. */
  | { kind: 'named'; name: string }
  | { kind: 'unsupported' };

/** The page-turning viewer verbs every PDF app knows (ISO 32000 Table 211). */
export type PdfStandardNamedAction = 'NextPage' | 'PrevPage' | 'FirstPage' | 'LastPage';

/**
 * The subset of {@link PdfLinkTarget} that drafts/patches may author:
 * in-document destinations, URIs and the four standard page-turning verbs.
 * Keeping `goto-remote`/`launch` out of the write surface is deliberate
 * (executable-shaped actions are a security liability the viewer never
 * needs to author), another app's own named verb is only sent back as read,
 * and `unsupported` carries nothing to write.
 */
export type PdfLinkTargetWritable<Destination = PageDestination> =
  | Extract<PdfLinkTarget<Destination>, { kind: 'goto' | 'uri' }>
  | { kind: 'named'; name: PdfStandardNamedAction };
