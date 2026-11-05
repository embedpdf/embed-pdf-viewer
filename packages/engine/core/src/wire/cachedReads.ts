import { z } from 'zod';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * The kinds of cached read (`…@token`), one per URL family. Besides its
 * versions and request, every cached read's token names the kind's engine
 * value, copied from `/head`, and the shape the client reads
 * (`docs/conventions/api-evolution.md`).
 */
export const CACHED_READ_KINDS = [
  'manifest',
  'layout',
  'text',
  'geometry',
  'render',
  'annotationAppearances',
  'widgetAppearances',
  'annotations',
  'annotationsAll',
  'annotationsExport',
  'form',
  'formExport',
  'metadata',
  'outline',
  'attachments',
  'actions',
  'fonts',
  'search',
  'signatures',
  'analysis',
  'download',
] as const;

export type CachedReadKind = (typeof CACHED_READ_KINDS)[number];

/**
 * A server's engine value for each kind: what it computes that kind with,
 * besides the document. Opaque to the client, which copies it into tokens.
 */
export type EngineValues = Readonly<Record<string, string>>;

/** `/head`'s `engine`: tolerant of kinds this code doesn't know. */
export const EngineValuesSchema = z.record(z.string(), z.string().regex(/^[A-Za-z0-9.-]+$/));

/**
 * The newest shape of each kind this code reads and answers. A client asks
 * for it; a server answers every shape from 1 up to its own.
 */
export const SHAPES: Readonly<Record<CachedReadKind, number>> = {
  manifest: 1,
  layout: 1,
  text: 1,
  geometry: 1,
  render: 1,
  annotationAppearances: 1,
  widgetAppearances: 1,
  annotations: 1,
  annotationsAll: 1,
  annotationsExport: 1,
  form: 1,
  formExport: 1,
  metadata: 1,
  outline: 1,
  attachments: 1,
  actions: 1,
  fonts: 1,
  search: 1,
  signatures: 1,
  analysis: 1,
  download: 1,
};

/** What a cached read's token carries besides its versions and request. */
export interface TokenPin {
  /** The kind's engine value, as `/head` gave it. */
  engine: string;
  /** The shape the client reads. */
  shape: number;
}

/** The pin a client puts in a `kind` token: the server's engine value and this code's shape. */
export function tokenPinOf(kind: CachedReadKind, engine: EngineValues): TokenPin {
  const value = engine[kind];
  if (value === undefined) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `the server gave no engine value for ${kind}`,
    );
  }
  return { engine: value, shape: SHAPES[kind] };
}
