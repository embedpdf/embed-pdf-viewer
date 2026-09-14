import { decodeToken, encodeToken, type TokenInput, type TokenQuery } from './token';

export type { TokenInput } from './token';
import { SIGNATURE_POLICY_VERSION } from '../signature/protection';
import {
  AnalysisTokenSchema,
  AnnotationAppearancesRenderTokenSchema,
  AnnotationTokenSchema,
  AnnotationsAllTokenSchema,
  ActionsTokenSchema,
  AttachmentsTokenSchema,
  ContentTokenSchema,
  DocTokenSchema,
  DownloadTokenSchema,
  LayoutTokenSchema,
  MetadataTokenSchema,
  RenderTokenSchema,
  SearchTokenSchema,
} from './tokenSchemas';
import type { PdfSaveMode } from '../dto/PdfSaveMode';
import type { ModificationLevel } from '../signature/types';
import type { SearchQuery, SearchSliceBudget } from '../search/types';

export interface DownloadToken {
  docVersion: number;
  mode: PdfSaveMode;
}

/** The layer analysis token: the pin plus the flat `AnalyzeInput` (until = the working copy). */
export interface AnalysisToken {
  docVersion: number;
  since: { signatureIndex: number } | { revisionIndex: number };
  exploratoryLevel?: ModificationLevel;
  /** The judging policy version the caller expects (`SIGNATURE_POLICY_VERSION`); keys the cache. */
  policyVersion?: number;
  /** `full` carries every pairwise step; default `summary`. */
  detail?: 'summary' | 'full';
}

export const encodeAnalysisToken = (input: AnalysisToken): string =>
  encodeToken(AnalysisTokenSchema, {
    docVersion: input.docVersion,
    'since.signature': 'signatureIndex' in input.since ? input.since.signatureIndex : undefined,
    'since.revision': 'revisionIndex' in input.since ? input.since.revisionIndex : undefined,
    level: input.exploratoryLevel,
    policy: input.policyVersion ?? SIGNATURE_POLICY_VERSION,
    detail: input.detail,
  });

export const decodeAnalysisToken = (raw: string): AnalysisToken => {
  const t = decodeToken(AnalysisTokenSchema, raw);
  const sinceSignature = t['since.signature'];
  const sinceRevision = t['since.revision'];
  if ((sinceSignature === undefined) === (sinceRevision === undefined)) {
    throw new Error('analysis token needs exactly one of "since.signature" / "since.revision"');
  }
  return {
    docVersion: decodePositiveInteger(t.docVersion, 'docVersion'),
    since:
      sinceSignature !== undefined
        ? { signatureIndex: decodeNonNegativeInteger(sinceSignature, 'since.signature') }
        : { revisionIndex: decodeNonNegativeInteger(sinceRevision!, 'since.revision') },
    ...(t.level !== undefined ? { exploratoryLevel: decodeModificationLevel(t.level) } : {}),
    ...(t.policy !== undefined ? { policyVersion: decodePositiveInteger(t.policy, 'policy') } : {}),
    ...(t.detail !== undefined ? { detail: decodeDetail(t.detail) } : {}),
  };
};

function decodeDetail(raw: string): 'summary' | 'full' {
  if (raw !== 'summary' && raw !== 'full') {
    throw new Error('token field "detail" must be summary|full');
  }
  return raw;
}

const MODIFICATION_LEVELS: ReadonlyArray<ModificationLevel> = ['none', 'lta', 'fill', 'annotate'];
function decodeModificationLevel(raw: string): ModificationLevel {
  if (!(MODIFICATION_LEVELS as readonly string[]).includes(raw)) {
    throw new Error(`token field "level" must be one of ${MODIFICATION_LEVELS.join('|')}`);
  }
  return raw as ModificationLevel;
}

function decodeNonNegativeInteger(raw: string | undefined, field: string): number {
  if (raw === undefined) throw new Error(`token is missing "${field}"`);
  if (!/^(0|[1-9][0-9]*)$/.test(raw))
    throw new Error(`token field "${field}" must be a non-negative integer`);
  return Number(raw);
}

export const encodeDocToken = (docVersion: number): string =>
  encodeToken(DocTokenSchema, { docVersion });
export const decodeDocToken = (raw: string): number =>
  decodePositiveInteger(decodeToken(DocTokenSchema, raw).docVersion, 'docVersion');

export const encodeContentToken = (contentVersion: number): string =>
  encodeToken(ContentTokenSchema, { contentVersion });
export const decodeContentToken = (raw: string): number =>
  decodePositiveInteger(decodeToken(ContentTokenSchema, raw).contentVersion, 'contentVersion');

export const encodeLayoutToken = (layoutVersion: number): string =>
  encodeToken(LayoutTokenSchema, { layoutVersion });
export const decodeLayoutToken = (raw: string): number =>
  decodePositiveInteger(decodeToken(LayoutTokenSchema, raw).layoutVersion, 'layoutVersion');

export const encodeMetadataToken = (metadataVersion: number): string =>
  encodeToken(MetadataTokenSchema, { metadataVersion });
export const decodeMetadataToken = (raw: string): number =>
  decodePositiveInteger(decodeToken(MetadataTokenSchema, raw).metadataVersion, 'metadataVersion');

export const encodeAnnotationToken = (annotationVersion: number): string =>
  encodeToken(AnnotationTokenSchema, { annotationVersion });
export const decodeAnnotationToken = (raw: string): number =>
  decodePositiveInteger(
    decodeToken(AnnotationTokenSchema, raw).annotationVersion,
    'annotationVersion',
  );

export const encodeAnnotationsAllToken = (annotationsVersion: number): string =>
  encodeToken(AnnotationsAllTokenSchema, { annotationsVersion });
export const decodeAnnotationsAllToken = (raw: string): number =>
  decodePositiveInteger(
    decodeToken(AnnotationsAllTokenSchema, raw).annotationsVersion,
    'annotationsVersion',
  );

export const encodeActionsToken = (actionsVersion: number): string =>
  encodeToken(ActionsTokenSchema, { actionsVersion });
export const decodeActionsToken = (raw: string): number =>
  decodePositiveInteger(decodeToken(ActionsTokenSchema, raw).actionsVersion, 'actionsVersion');

export const encodeAttachmentsToken = (attachmentsVersion: number): string =>
  encodeToken(AttachmentsTokenSchema, { attachmentsVersion });
export const decodeAttachmentsToken = (raw: string): number =>
  decodePositiveInteger(
    decodeToken(AttachmentsTokenSchema, raw).attachmentsVersion,
    'attachmentsVersion',
  );

export const encodeDownloadToken = (input: DownloadToken): string =>
  encodeToken(DownloadTokenSchema, { docVersion: input.docVersion, mode: input.mode });
export const decodeDownloadToken = (raw: string): DownloadToken => {
  const decoded = decodeToken(DownloadTokenSchema, raw);
  return {
    docVersion: decodePositiveInteger(decoded.docVersion, 'docVersion'),
    mode: decodePdfSaveMode(decoded.mode),
  };
};

/**
 * Encode a render token from a flat wire-shape input. The input is the
 * output of `flatten(...)` over an SDK `PageImageOptions`-shaped object plus
 * cache versions. Semantic invariants (viewport-kind XOR fields, per-family
 * pin grammar — annotatedness itself is PATH-expressed, never a token key —
 * target rect coherence) live in the per-family render query schemas —
 * running them here would duplicate the spec.
 */
export const encodeRenderToken = (input: TokenInput): string =>
  encodeToken(RenderTokenSchema, input);

/**
 * Decode a render token to a flat `Record<string, string>` of allowed
 * fields. Use `unflatten(...)` + `PageImageOptionsWireSchema.parse(...)` to
 * recover the nested SDK shape with full coercion + validation.
 */
export const decodeRenderToken = (raw: string): TokenQuery => decodeToken(RenderTokenSchema, raw);

/**
 * Encode an annotation-appearance render token from a flat wire-shape input
 * (the `flatten(...)` of an `AnnotationAppearanceImageOptions`-shaped object
 * plus cache versions). Semantic validation lives in
 * `AnnotationAppearancesQuerySchema`.
 */
export const encodeAnnotationAppearancesRenderToken = (input: TokenInput): string =>
  encodeToken(AnnotationAppearancesRenderTokenSchema, input);

/** Decode an annotation-appearance render token to a flat field map. */
export const decodeAnnotationAppearancesRenderToken = (raw: string): TokenQuery =>
  decodeToken(AnnotationAppearancesRenderTokenSchema, raw);

/**
 * The decoded state of a versioned search URL — the WHOLE cache key.
 * `epoch` is `searchContentEpoch(manifest)`; `skip` is the number of
 * scan-order pages already consumed (0 = first slice). The server mints
 * continuation tokens (same epoch, advanced skip); the client decodes
 * them only to verify a resumed cursor still belongs to its query.
 */
export interface SearchToken {
  epoch: string;
  query: SearchQuery;
  startPage?: number;
  skip: number;
  budget?: SearchSliceBudget;
}

/**
 * The search RESULT representation this client speaks — part of the token
 * (and therefore the versioned URL), so a response-shape change can never
 * serve a stale CDN body to a newer client: new tokens are new cache keys,
 * and old tokens fail decode on new servers. Deliberately ALWAYS encoded —
 * an exception to the omit-defaults rule, because its entire job is to
 * change the token bytes when the format changes.
 */
export const SEARCH_RESULT_FORMAT = 'segments1';

export const encodeSearchToken = (input: SearchToken): string => {
  const q = input.query;
  return encodeToken(SearchTokenSchema, {
    epoch: input.epoch,
    format: SEARCH_RESULT_FORMAT,
    q: encodeTokenText(q.text),
    // Canonical keys: every default is OMITTED, never encoded as false/0.
    regex: q.regex ? true : undefined,
    matchCase: q.matchCase ? true : undefined,
    matchDiacritics: q.matchDiacritics ? true : undefined,
    wholeWord: q.wholeWord ? true : undefined,
    startPage: input.startPage,
    skip: input.skip > 0 ? input.skip : undefined,
    maxPages: input.budget?.maxPages,
    maxMatches: input.budget?.maxMatches,
  });
};

export const decodeSearchToken = (raw: string): SearchToken => {
  const t = decodeToken(SearchTokenSchema, raw);
  if (t.epoch === undefined) throw new Error('search token is missing "epoch"');
  if (t.q === undefined) throw new Error('search token is missing "q"');
  if (t.format !== SEARCH_RESULT_FORMAT) {
    throw new Error(
      `search token has unsupported result format "${t.format ?? 'legacy'}" ` +
        `(expected "${SEARCH_RESULT_FORMAT}")`,
    );
  }
  const query: SearchQuery = {
    text: decodeTokenText(t.q),
    ...(t.regex === 'true' ? { regex: true } : {}),
    ...(t.matchCase === 'true' ? { matchCase: true } : {}),
    ...(t.matchDiacritics === 'true' ? { matchDiacritics: true } : {}),
    ...(t.wholeWord === 'true' ? { wholeWord: true } : {}),
  };
  const maxPages =
    t.maxPages === undefined ? undefined : decodePositiveInteger(t.maxPages, 'maxPages');
  const maxMatches =
    t.maxMatches === undefined ? undefined : decodePositiveInteger(t.maxMatches, 'maxMatches');
  return {
    epoch: t.epoch,
    query,
    ...(t.startPage === undefined
      ? {}
      : { startPage: decodePositiveInteger(t.startPage, 'startPage') }),
    skip: t.skip === undefined ? 0 : decodePositiveInteger(t.skip, 'skip'),
    ...(maxPages !== undefined || maxMatches !== undefined
      ? {
          budget: {
            ...(maxPages !== undefined ? { maxPages } : {}),
            ...(maxMatches !== undefined ? { maxMatches } : {}),
          },
        }
      : {}),
  };
};

// Query text inside a token: UTF-8 → base64 with `-` for `+` and `.` for
// `/`, unpadded — exactly the token grammar's value charset [A-Za-z0-9.-].
// Dependency-free (no Buffer: this runs in browsers too).
const TOKEN_TEXT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.';

export function encodeTokenText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += TOKEN_TEXT_ALPHABET[b0 >> 2];
    out += TOKEN_TEXT_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += TOKEN_TEXT_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += TOKEN_TEXT_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function decodeTokenText(encoded: string): string {
  if (encoded.length % 4 === 1) throw new Error('malformed token text');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of encoded) {
    const value = TOKEN_TEXT_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('malformed token text');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
}

function decodePositiveInteger(raw: string | undefined, field: string): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error(`token field "${field}" must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`token field "${field}" must be a positive integer`);
  }
  return value;
}

function decodePdfSaveMode(raw: string | undefined): PdfSaveMode {
  if (raw === 'incremental' || raw === 'rewrite') return raw;
  throw new Error(`token field "mode" must be "incremental" or "rewrite"`);
}
