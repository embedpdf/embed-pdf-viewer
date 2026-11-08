import { decodeToken, encodeToken, type TokenInput, type TokenQuery } from './token';

export type { TokenInput } from './token';
import { SIGNATURE_POLICY_VERSION } from '../signature/protection';
import {
  AnalysisTokenSchema,
  AnnotationAppearancesRenderTokenSchema,
  AnnotationTokenSchema,
  AnnotationsAllTokenSchema,
  AnnotationsExportTokenSchema,
  ActionsTokenSchema,
  FormExportTokenSchema,
  AttachmentsTokenSchema,
  OutlineTokenSchema,
  FontsTokenSchema,
  ContentTokenSchema,
  DocTokenSchema,
  DownloadTokenSchema,
  FormTokenSchema,
  LayoutTokenSchema,
  MetadataTokenSchema,
  RenderTokenSchema,
  SearchTokenSchema,
  WidgetAppearancesRenderTokenSchema,
} from './tokenSchemas';
import type { PdfSaveMode } from '../dto/PdfSaveMode';
import { decodeAnnotKey, encodeAnnotKey } from '../identity/AnnotationRef';
import { decodeFieldRefKey, encodeFieldRefKey } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';
import type { AnnotationExportSelection } from '../transfer/exportSelection';
import type { FormExportSelection } from '../transfer/formExport';
import type { ModificationLevel } from '../signature/types';
import type { SearchLimit, SearchQuery } from '../search/types';
import type { TokenPin } from './cachedReads';

export interface DownloadToken {
  docVersion: number;
  mode: PdfSaveMode;
  pin: TokenPin;
}

/** The layer analysis token: the pin plus the flat `AnalyzeInput` (until = the working copy). */
export interface AnalysisToken {
  docVersion: number;
  pin: TokenPin;
  since: { signatureIndex: number } | { revisionIndex: number };
  exploratoryLevel?: ModificationLevel;
  /** The judging policy version the caller expects (`SIGNATURE_POLICY_VERSION`); keys the cache. */
  policyVersion?: number;
  /** `full` carries every pairwise step; default `summary`. */
  detail?: 'summary' | 'full';
}

export const encodeAnalysisToken = (input: AnalysisToken): string =>
  encodeToken(AnalysisTokenSchema, {
    ...pinFields(input.pin),
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
    pin: decodePin(t),
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

export const encodeDocToken = (docVersion: number, pin: TokenPin): string =>
  encodeToken(DocTokenSchema, { docVersion, ...pinFields(pin) });
export const decodeDocToken = (raw: string): { docVersion: number; pin: TokenPin } => {
  const t = decodeToken(DocTokenSchema, raw);
  return { docVersion: decodePositiveInteger(t.docVersion, 'docVersion'), pin: decodePin(t) };
};

export const encodeContentToken = (contentVersion: number, pin: TokenPin): string =>
  encodeToken(ContentTokenSchema, { contentVersion, ...pinFields(pin) });
export const decodeContentToken = (raw: string): { contentVersion: number; pin: TokenPin } => {
  const t = decodeToken(ContentTokenSchema, raw);
  return {
    contentVersion: decodePositiveInteger(t.contentVersion, 'contentVersion'),
    pin: decodePin(t),
  };
};

/**
 * What a layout leaf is: the layout's pin and, from a server that keeps it,
 * the pages' scales' pin (`viewportsVersion`). A token without it asks for
 * the layout without the pages' viewports, which a scale change doesn't move.
 */
export interface LayoutToken {
  layoutVersion: number;
  viewportsVersion?: number;
  pin: TokenPin;
}

export const encodeLayoutToken = (token: LayoutToken): string =>
  encodeToken(LayoutTokenSchema, {
    ...pinFields(token.pin),
    layoutVersion: token.layoutVersion,
    viewportsVersion: token.viewportsVersion,
  });
export const decodeLayoutToken = (raw: string): LayoutToken => {
  const t = decodeToken(LayoutTokenSchema, raw);
  return {
    layoutVersion: decodePositiveInteger(t.layoutVersion, 'layoutVersion'),
    ...(t.viewportsVersion === undefined
      ? {}
      : { viewportsVersion: decodePositiveInteger(t.viewportsVersion, 'viewportsVersion') }),
    pin: decodePin(t),
  };
};

export const encodeMetadataToken = (metadataVersion: number, pin: TokenPin): string =>
  encodeToken(MetadataTokenSchema, { metadataVersion, ...pinFields(pin) });
export const decodeMetadataToken = (raw: string): { metadataVersion: number; pin: TokenPin } => {
  const t = decodeToken(MetadataTokenSchema, raw);
  return {
    metadataVersion: decodePositiveInteger(t.metadataVersion, 'metadataVersion'),
    pin: decodePin(t),
  };
};

export const encodeAnnotationToken = (annotationVersion: number, pin: TokenPin): string =>
  encodeToken(AnnotationTokenSchema, { annotationVersion, ...pinFields(pin) });
export const decodeAnnotationToken = (
  raw: string,
): { annotationVersion: number; pin: TokenPin } => {
  const t = decodeToken(AnnotationTokenSchema, raw);
  return {
    annotationVersion: decodePositiveInteger(t.annotationVersion, 'annotationVersion'),
    pin: decodePin(t),
  };
};

export const encodeAnnotationsAllToken = (annotationsVersion: number, pin: TokenPin): string =>
  encodeToken(AnnotationsAllTokenSchema, { annotationsVersion, ...pinFields(pin) });
export const decodeAnnotationsAllToken = (
  raw: string,
): { annotationsVersion: number; pin: TokenPin } => {
  const t = decodeToken(AnnotationsAllTokenSchema, raw);
  return {
    annotationsVersion: decodePositiveInteger(t.annotationsVersion, 'annotationsVersion'),
    pin: decodePin(t),
  };
};

export const encodeFormToken = (formsVersion: number, pin: TokenPin): string =>
  encodeToken(FormTokenSchema, { formsVersion, ...pinFields(pin) });
export const decodeFormToken = (raw: string): { formsVersion: number; pin: TokenPin } => {
  const t = decodeToken(FormTokenSchema, raw);
  return { formsVersion: decodePositiveInteger(t.formsVersion, 'formsVersion'), pin: decodePin(t) };
};

/** What a `doc.annotations.export` leaf is: two pins and a selection. */
export interface AnnotationsExportToken {
  annotationsVersion: number;
  layoutVersion: number;
  selection: AnnotationExportSelection;
  pin: TokenPin;
}

/** A selection as the token holds it: pages by object number, refs as `[page, annotKey]` (`obj:42`, `base:2`). */
interface TokenSelection {
  p?: number[];
  r?: Array<[number, string]>;
}

export const encodeAnnotationsExportToken = (token: AnnotationsExportToken): string => {
  const { selection } = token;
  const wire: TokenSelection = {};
  if (selection.pages) {
    wire.p = [...new Set(selection.pages.map((page) => page.objectNumber))].sort(
      (left, right) => left - right,
    );
  }
  if (selection.refs) {
    const refs = new Map<string, [number, string]>();
    for (const ref of selection.refs) {
      const entry: [number, string] = [ref.page.objectNumber, encodeAnnotKey(ref)];
      refs.set(JSON.stringify(entry), entry);
    }
    wire.r = [...refs.keys()].sort().map((key) => refs.get(key)!);
  }
  return encodeToken(AnnotationsExportTokenSchema, {
    ...pinFields(token.pin),
    annotationsVersion: token.annotationsVersion,
    layoutVersion: token.layoutVersion,
    include: selection.include === 'references' ? 'references' : undefined,
    selection: wire.p || wire.r ? encodeTokenText(JSON.stringify(wire)) : undefined,
  });
};

export const decodeAnnotationsExportToken = (raw: string): AnnotationsExportToken => {
  const query = decodeToken(AnnotationsExportTokenSchema, raw);
  const selection: {
    -readonly [K in keyof AnnotationExportSelection]: AnnotationExportSelection[K];
  } = {};
  if (query.include !== undefined) {
    if (query.include !== 'references') throw new Error(`unknown include "${query.include}"`);
    selection.include = 'references';
  }
  if (query.selection !== undefined) {
    const wire = JSON.parse(decodeTokenText(query.selection)) as TokenSelection;
    const isNumber = (value: unknown): value is number =>
      Number.isInteger(value) && (value as number) > 0;
    if (typeof wire !== 'object' || wire === null) throw new Error('malformed export selection');
    if (wire.p !== undefined) {
      if (!Array.isArray(wire.p) || !wire.p.every(isNumber)) {
        throw new Error('malformed export pages');
      }
      selection.pages = wire.p.map((pageObjectNumber) => toPageRef(pageObjectNumber));
    }
    if (wire.r !== undefined) {
      if (!Array.isArray(wire.r)) throw new Error('malformed export refs');
      selection.refs = wire.r.map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2 || !isNumber(entry[0])) {
          throw new Error('malformed export ref');
        }
        const ref =
          typeof entry[1] === 'string' ? decodeAnnotKey(toPageRef(entry[0]), entry[1]) : null;
        if (!ref) throw new Error('malformed export ref');
        return ref;
      });
    }
  }
  return {
    annotationsVersion: decodePositiveInteger(query.annotationsVersion, 'annotationsVersion'),
    layoutVersion: decodePositiveInteger(query.layoutVersion, 'layoutVersion'),
    selection,
    pin: decodePin(query),
  };
};

/** What a `doc.forms.export` leaf is: two pins and a selection. */
export interface FormExportToken {
  formsVersion: number;
  layoutVersion: number;
  selection: FormExportSelection;
  pin: TokenPin;
}

/** A form selection as the token holds it: pages by object number, fields by key (`obj:12`, `fqn:a.b`). */
interface FormTokenSelection {
  p?: number[];
  f?: string[];
}

export const encodeFormExportToken = (token: FormExportToken): string => {
  const { selection } = token;
  const wire: FormTokenSelection = {};
  if (selection.pages) {
    wire.p = [...new Set(selection.pages.map((page) => page.objectNumber))].sort(
      (left, right) => left - right,
    );
  }
  if (selection.fields) wire.f = [...new Set(selection.fields.map(encodeFieldRefKey))].sort();
  return encodeToken(FormExportTokenSchema, {
    ...pinFields(token.pin),
    formsVersion: token.formsVersion,
    layoutVersion: token.layoutVersion,
    selection: wire.p || wire.f ? encodeTokenText(JSON.stringify(wire)) : undefined,
  });
};

export const decodeFormExportToken = (raw: string): FormExportToken => {
  const query = decodeToken(FormExportTokenSchema, raw);
  const selection: { -readonly [K in keyof FormExportSelection]: FormExportSelection[K] } = {};
  if (query.selection !== undefined) {
    const wire = JSON.parse(decodeTokenText(query.selection)) as FormTokenSelection;
    if (typeof wire !== 'object' || wire === null) throw new Error('malformed export selection');
    if (wire.p !== undefined) {
      const isNumber = (value: unknown): value is number =>
        Number.isInteger(value) && (value as number) > 0;
      if (!Array.isArray(wire.p) || !wire.p.every(isNumber)) {
        throw new Error('malformed export pages');
      }
      selection.pages = wire.p.map((pageObjectNumber) => toPageRef(pageObjectNumber));
    }
    if (wire.f !== undefined) {
      if (!Array.isArray(wire.f)) throw new Error('malformed export fields');
      selection.fields = wire.f.map((key) => {
        const ref = typeof key === 'string' ? decodeFieldRefKey(key) : null;
        if (!ref) throw new Error('malformed export field');
        return ref;
      });
    }
  }
  return {
    formsVersion: decodePositiveInteger(query.formsVersion, 'formsVersion'),
    layoutVersion: decodePositiveInteger(query.layoutVersion, 'layoutVersion'),
    selection,
    pin: decodePin(query),
  };
};

export const encodeActionsToken = (actionsVersion: number, pin: TokenPin): string =>
  encodeToken(ActionsTokenSchema, { actionsVersion, ...pinFields(pin) });
export const decodeActionsToken = (raw: string): { actionsVersion: number; pin: TokenPin } => {
  const t = decodeToken(ActionsTokenSchema, raw);
  return {
    actionsVersion: decodePositiveInteger(t.actionsVersion, 'actionsVersion'),
    pin: decodePin(t),
  };
};

/** What an outline leaf is: the outline's pin and the layout's. */
export interface OutlineToken {
  outlineVersion: number;
  layoutVersion: number;
  pin: TokenPin;
}

export const encodeOutlineToken = (token: OutlineToken): string =>
  encodeToken(OutlineTokenSchema, {
    ...pinFields(token.pin),
    layoutVersion: token.layoutVersion,
    outlineVersion: token.outlineVersion,
  });
export const decodeOutlineToken = (raw: string): OutlineToken => {
  const query = decodeToken(OutlineTokenSchema, raw);
  return {
    outlineVersion: decodePositiveInteger(query.outlineVersion, 'outlineVersion'),
    layoutVersion: decodePositiveInteger(query.layoutVersion, 'layoutVersion'),
    pin: decodePin(query),
  };
};

/** What a font list is: the document's fonts' pin. */
export interface FontsToken {
  fontsVersion: number;
  pin: TokenPin;
}

export const encodeFontsToken = (token: FontsToken): string =>
  encodeToken(FontsTokenSchema, { fontsVersion: token.fontsVersion, ...pinFields(token.pin) });
export const decodeFontsToken = (raw: string): FontsToken => {
  const query = decodeToken(FontsTokenSchema, raw);
  return {
    fontsVersion: decodePositiveInteger(query.fontsVersion, 'fontsVersion'),
    pin: decodePin(query),
  };
};

export const encodeAttachmentsToken = (attachmentsVersion: number, pin: TokenPin): string =>
  encodeToken(AttachmentsTokenSchema, { attachmentsVersion, ...pinFields(pin) });
export const decodeAttachmentsToken = (
  raw: string,
): { attachmentsVersion: number; pin: TokenPin } => {
  const t = decodeToken(AttachmentsTokenSchema, raw);
  return {
    attachmentsVersion: decodePositiveInteger(t.attachmentsVersion, 'attachmentsVersion'),
    pin: decodePin(t),
  };
};

export const encodeDownloadToken = (input: DownloadToken): string =>
  encodeToken(DownloadTokenSchema, {
    docVersion: input.docVersion,
    mode: input.mode,
    ...pinFields(input.pin),
  });
export const decodeDownloadToken = (raw: string): DownloadToken => {
  const decoded = decodeToken(DownloadTokenSchema, raw);
  return {
    docVersion: decodePositiveInteger(decoded.docVersion, 'docVersion'),
    mode: decodePdfSaveMode(decoded.mode),
    pin: decodePin(decoded),
  };
};

/**
 * Encode a render token from a flat wire-shape input. The input is the
 * output of `flatten(...)` over an SDK `PageImageOptions`-shaped object plus
 * cache versions. Semantic invariants (viewport-kind XOR fields, per-family
 * pin grammar — annotatedness itself is path-expressed, never a token key —
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
/** `modes` as one token value: the modes in engine order, joined by `-`. */
export const encodeAppearanceModes = (modes: readonly string[]): string => modes.join('-');

export const encodeAnnotationAppearancesRenderToken = (input: TokenInput): string =>
  encodeToken(AnnotationAppearancesRenderTokenSchema, input);

/** Decode an annotation-appearance render token to a flat field map. */
export const decodeAnnotationAppearancesRenderToken = (raw: string): TokenQuery =>
  decodeToken(AnnotationAppearancesRenderTokenSchema, raw);

/** Encode a widget-appearance render token, the annotation one's twin keyed by `widgetVersion`. */
export const encodeWidgetAppearancesRenderToken = (input: TokenInput): string =>
  encodeToken(WidgetAppearancesRenderTokenSchema, input);

/** Decode a widget-appearance render token to a flat field map. */
export const decodeWidgetAppearancesRenderToken = (raw: string): TokenQuery =>
  decodeToken(WidgetAppearancesRenderTokenSchema, raw);

/**
 * The decoded state of a versioned search URL — the whole cache key. A
 * search reads every page's text in page order, so it pins the manifest's
 * `contentsVersion` and `layoutVersion`; `from` is the scan origin by page
 * object number; `skip` the number of scan-order pages already searched
 * (0 = first batch). The server mints continuation tokens (same pins,
 * advanced skip); the client decodes them only to verify a resumed cursor
 * still belongs to its query.
 */
export interface SearchToken {
  contentsVersion: number;
  layoutVersion: number;
  query: SearchQuery;
  from?: number;
  skip: number;
  limit?: SearchLimit;
  pin: TokenPin;
}

export const encodeSearchToken = (input: SearchToken): string => {
  const q = input.query;
  return encodeToken(SearchTokenSchema, {
    ...pinFields(input.pin),
    contentsVersion: input.contentsVersion,
    layoutVersion: input.layoutVersion,
    q: encodeTokenText(q.text),
    // Canonical keys: every default is omitted, never encoded as false/0.
    regex: q.regex ? true : undefined,
    matchCase: q.matchCase ? true : undefined,
    matchDiacritics: q.matchDiacritics ? true : undefined,
    wholeWord: q.wholeWord ? true : undefined,
    ignoreWhitespace: q.ignoreWhitespace ? true : undefined,
    from: input.from,
    skip: input.skip > 0 ? input.skip : undefined,
    limitPages: input.limit?.pages,
    limitMatches: input.limit?.matches,
  });
};

export const decodeSearchToken = (raw: string): SearchToken => {
  const t = decodeToken(SearchTokenSchema, raw);
  if (t.q === undefined) throw new Error('search token is missing "q"');
  const query: SearchQuery = {
    text: decodeTokenText(t.q),
    ...(t.regex === 'true' ? { regex: true } : {}),
    ...(t.matchCase === 'true' ? { matchCase: true } : {}),
    ...(t.matchDiacritics === 'true' ? { matchDiacritics: true } : {}),
    ...(t.wholeWord === 'true' ? { wholeWord: true } : {}),
    ...(t.ignoreWhitespace === 'true' ? { ignoreWhitespace: true } : {}),
  };
  const pages =
    t.limitPages === undefined ? undefined : decodePositiveInteger(t.limitPages, 'limitPages');
  const matches =
    t.limitMatches === undefined
      ? undefined
      : decodePositiveInteger(t.limitMatches, 'limitMatches');
  return {
    contentsVersion: decodePositiveInteger(t.contentsVersion, 'contentsVersion'),
    layoutVersion: decodePositiveInteger(t.layoutVersion, 'layoutVersion'),
    pin: decodePin(t),
    query,
    ...(t.from === undefined ? {} : { from: decodePositiveInteger(t.from, 'from') }),
    skip: t.skip === undefined ? 0 : decodePositiveInteger(t.skip, 'skip'),
    ...(pages !== undefined || matches !== undefined
      ? {
          limit: {
            ...(matches !== undefined ? { matches } : {}),
            ...(pages !== undefined ? { pages } : {}),
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

/** A pin as token fields. */
function pinFields(pin: TokenPin): { engine: string; shape: number } {
  return { engine: pin.engine, shape: pin.shape };
}

/** The pin every cached read's token carries. */
function decodePin(query: TokenQuery): TokenPin {
  if (query.engine === undefined) throw new Error('token is missing "engine"');
  return { engine: query.engine, shape: decodePositiveInteger(query.shape, 'shape') };
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
