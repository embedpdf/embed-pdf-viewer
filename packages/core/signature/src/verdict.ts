import type {
  DocumentHandle,
  SignatureDTO,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';

import { bytesEqual } from './cms/engine';
import { CmsError, parseCmsInternal, type ParsedCms, type ParsedCmsInternal } from './cms/parse';
import { verifyCmsSignature, type CryptographyVerdict } from './cms/verify';
import { validateChain, type TrustPort, type TrustStatus, type ValidationTime } from './trust';

export type IntegrityVerdict = 'valid' | 'invalid' | 'indeterminate';
export type ModificationsVerdict = 'unchanged' | 'permitted' | 'forbidden' | 'indeterminate';

/**
 * Four independent facts and a summary, never one boolean — the shape
 * Acrobat reports ("signature valid", "signer unknown", "document changed,
 * changes allowed") and the shape a UI can explain.
 */
export interface SignatureVerdict {
  signature: SignatureDTO;
  /** The sealed bytes are intact: whole-revision coverage and the CMS message digest matches them. */
  integrity: IntegrityVerdict;
  /** The CMS verifies with its own certificate. */
  cryptography: CryptographyVerdict;
  /** The certificate chains to one of the caller's anchors. */
  trust: TrustStatus;
  trustReason?: string;
  validatedAt: ValidationTime;
  /**
   * What changed after the signature, and which bytes were judged: the loaded
   * file (`persisted`), or the session's unsaved edits snapshotted as one
   * more revision (`working-copy` — only when such edits existed).
   */
  modifications: {
    verdict: ModificationsVerdict;
    detail?: string;
    basis: 'persisted' | 'working-copy';
  };
  /** `invalid` only on positive evidence; `indeterminate` whenever a fact could not be established. */
  summary: 'valid' | 'valid-untrusted' | 'invalid' | 'indeterminate';
  cms: ParsedCms | null;
}

export interface ValidateSignaturesOptions {
  trust?: TrustPort | null;
  at?: ValidationTime;
  /**
   * `persisted` (default): the loaded bytes — what a file on disk says.
   * `working-copy`: unsaved edits are judged too, as the revision a save would
   * write — what the file a save produces will say. A viewer shows this one.
   */
  until?: 'persisted' | 'working-copy';
}

/**
 * Validate every signature of a document: integrity from the engine's
 * bytes, cryptography from the CMS, trust from the caller's anchors.
 */
export async function validateSignatures(
  doc: DocumentHandle,
  opts: ValidateSignaturesOptions = {},
): Promise<SignatureVerdict[]> {
  if (!doc.signatures) throw new Error('this engine does not implement signatures');
  const snapshot = await doc.signatures.list();
  const verdicts: SignatureVerdict[] = [];
  for (const signature of snapshot.signatures) {
    if (!signature.signed) continue;
    verdicts.push(await validateOne(doc, snapshot, signature, opts));
  }
  return verdicts;
}

async function validateOne(
  doc: DocumentHandle,
  snapshot: SignatureSnapshot,
  signature: SignatureDTO,
  opts: ValidateSignaturesOptions,
): Promise<SignatureVerdict> {
  const at = opts.at ?? { kind: 'now' };
  let integrity: IntegrityVerdict = 'indeterminate';
  let cryptography: CryptographyVerdict = 'unsupported';
  let trust: TrustStatus = 'unknown';
  let trustReason: string | undefined;
  let internal: ParsedCmsInternal | null = null;
  let cms: ParsedCms | null = null;

  if (!snapshot.chainValid || signature.coverage === 'malformed') {
    integrity = snapshot.chainValid ? 'invalid' : 'indeterminate';
  } else {
    try {
      const contents = await doc.signatures!.contents(signature.field);
      internal = parseCmsInternal(contents);
      cms = internal.parsed;
      const digest = await doc.signatures!.digest(signature.field, cms.digestAlgorithm);
      const digestMatches = bytesEqual(digest, cms.messageDigest);
      integrity = signature.coverage === 'whole-revision' && digestMatches ? 'valid' : 'invalid';
    } catch (err) {
      // A CMS this engine cannot read is not evidence of tampering.
      integrity =
        err instanceof CmsError && err.reason === 'unsupported' ? 'indeterminate' : 'invalid';
      if (!(err instanceof CmsError)) integrity = 'indeterminate';
    }
  }

  if (internal) {
    cryptography = await verifyCmsSignature(internal);
    const chain = await validateChain(internal, opts.trust, at);
    trust = chain.status;
    trustReason = chain.reason;
  }

  const modifications = await modificationsOf(doc, snapshot, signature, opts.until ?? 'persisted');

  let summary: SignatureVerdict['summary'];
  if (
    integrity === 'invalid' ||
    cryptography === 'invalid' ||
    modifications.verdict === 'forbidden'
  ) {
    summary = 'invalid';
  } else if (
    integrity === 'indeterminate' ||
    cryptography === 'unsupported' ||
    modifications.verdict === 'indeterminate'
  ) {
    summary = 'indeterminate';
  } else {
    summary = trust === 'trusted' ? 'valid' : 'valid-untrusted';
  }

  return {
    signature,
    integrity,
    cryptography,
    trust,
    trustReason,
    validatedAt: at,
    modifications,
    summary,
    cms,
  };
}

/**
 * What changed after the signature, from the engine's revision analysis:
 * every later revision judged against the restrictions in force. A
 * signature that seals the last revision is `unchanged` without analysis.
 */
async function modificationsOf(
  doc: DocumentHandle,
  snapshot: SignatureSnapshot,
  signature: SignatureDTO,
  until: 'persisted' | 'working-copy',
): Promise<SignatureVerdict['modifications']> {
  if (signature.revisionIndex === null) {
    return {
      verdict: 'indeterminate',
      detail: 'the signature seals no whole revision',
      basis: 'persisted',
    };
  }
  // "Nothing after it" is only knowable from the loaded bytes when unsaved
  // edits are not part of the question.
  if (until === 'persisted' && signature.revisionIndex === snapshot.revisions.length - 1) {
    return { verdict: 'unchanged', basis: 'persisted' };
  }
  try {
    // The analysis reports its own basis: `persisted` when there were no
    // unsaved edits to include, even when the working copy was asked for.
    const analysis = await doc.signatures!.analyze({
      since: { signatureIndex: signature.index },
      until,
    });
    const forbidden = analysis.steps
      .flatMap((s) => s.findings)
      .find((f) => f.verdict === 'forbidden');
    const incomplete = analysis.steps
      .flatMap((s) => s.findings)
      .find((f) => f.verdict === 'incomplete');
    const detail = forbidden
      ? `revision ${analysis.steps.find((s) => s.findings.includes(forbidden))?.newer}: object ${forbidden.objectNumber}, ${forbidden.rule}${forbidden.detail ? `: ${forbidden.detail}` : ''}`
      : incomplete
        ? `object ${incomplete.objectNumber}: ${incomplete.detail ?? 'incomplete evidence'}`
        : undefined;
    return { verdict: analysis.verdict, detail, basis: analysis.basis.source };
  } catch (err) {
    return {
      verdict: 'indeterminate',
      detail: `analysis failed: ${(err as Error).message}`,
      basis: 'persisted',
    };
  }
}
