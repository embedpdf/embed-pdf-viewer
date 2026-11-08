/**
 * The cloud door's vocabulary: its config and its documents.
 *
 * The CloudPDF viewer is the open-source viewer with the cloud engine as its default, as
 * `@embedpdf/viewer` is the same viewer with the built-in engine. So the config is the viewer's,
 * in this engine's words: `engine` takes the cloud engine's settings (where your CloudPDF runs,
 * CloudPDF SaaS when you name none), and a document is one your CloudPDF holds, named by a token,
 * by its id or by a grant. The token says what the user may do, so there is no `scope`.
 * `identity` is who your page knows the user is: a document token decides for itself, and a
 * grant takes it as the visitor's answers to what the link asks.
 */
import type { CloudEngineOptions, OpenInput, TokenSource } from '@cloudpdf/engine';
import type {
  DocumentEntry as ViewerDocumentEntry,
  ElementSrc,
  Engine,
  EngineFactory,
  MountTarget,
  ViewerConfigBase,
} from '@embedpdf/viewer/core';

/**
 * A CloudPDF document, in the three ways the engine opens one: with a document token your
 * backend creates for the user, which names the document; by its id, which the engine's
 * `token` (or this one) must allow; or with a grant from the dashboard (`grt_…`), with
 * its passphrase when it has one, and `restart` to start over on a link that keeps each
 * visitor's layer. A token is a string, or a function the viewer calls for a token and again
 * just before that token expires. With `id`, a new `src` for the same `id` keeps the document
 * open: a token function written inline, made again on every render, is the same document.
 */
export type DocumentSrc =
  | { readonly token: TokenSource }
  | { readonly id: string; readonly token?: TokenSource }
  | { readonly grant: string; readonly passphrase?: string; readonly restart?: boolean };

/** One of the documents `documents` opens, each in a tab of its own. */
export type DocumentEntry = ViewerDocumentEntry<DocumentSrc>;

/**
 * The cloud viewer's config: every key of the viewer's but `scope`, and `fetch`, which downloads
 * documents at a URL, where these live on CloudPDF. Its documents are in the cloud's words
 * (`src: { token }`, `{ id }` or `{ grant }`), and `engine` takes the cloud engine's
 * settings: `baseUrl` (CloudPDF SaaS when left out), the engine's own `token`, and the `fetch` it
 * reaches CloudPDF with. An engine you made yourself, or a function that makes one, goes there too.
 */
export interface ViewerConfig<AppState = any> extends Omit<
  ViewerConfigBase<DocumentSrc, AppState>,
  'scope' | 'fetch'
> {
  engine?: CloudEngineOptions | Engine | EngineFactory;
}

export interface InitOptions extends ViewerConfig, MountTarget {}

/** The `{ id, token }` inputs `openInputOf` made, each with the token its document asks now. */
const followed = new WeakMap<object, { token: TokenSource }>();

/**
 * What the cloud engine opens for a document: `{ kind: 'token' }`, `{ kind: 'id' }` or
 * `{ kind: 'grant' }`. Anything else (an open input already, or what the element reads itself)
 * opens as it is.
 */
export function openInputOf(src: ElementSrc): ElementSrc {
  if (typeof src !== 'object' || src === null || 'kind' in src) return src;
  if ('grant' in src && typeof src.grant === 'string') {
    const { grant, passphrase, restart } = src as {
      grant: string;
      passphrase?: string;
      restart?: boolean;
    };
    return {
      kind: 'grant',
      grant,
      ...(passphrase !== undefined ? { passphrase } : {}),
      ...(restart ? { restart } : {}),
    } satisfies OpenInput;
  }
  if ('id' in src && typeof src.id === 'string') {
    const { id, token } = src as { id: string; token?: TokenSource };
    if (token === undefined) return { kind: 'id', id } satisfies OpenInput;
    // The engine asks this for each token: the latest `src`'s, so a new token function for the
    // same document takes over without opening it again (see `followsSource`).
    const latest = { token };
    const input = {
      kind: 'id',
      id,
      token: async () => (typeof latest.token === 'function' ? await latest.token() : latest.token),
    } satisfies OpenInput;
    followed.set(input, latest);
    return input;
  }
  if ('token' in src) {
    return { kind: 'token', token: (src as { token: TokenSource }).token } satisfies OpenInput;
  }
  return src;
}

/**
 * Whether `next` is the same `{ id, token }` document as the one `opened` (an input
 * {@link openInputOf} made) opened: then that document stays open, and its next token comes from
 * `next`. Another `id`, or another kind of document, opens again.
 */
export function followsSource(opened: ElementSrc, next: ElementSrc): boolean {
  const latest = typeof opened === 'object' && opened !== null ? followed.get(opened) : undefined;
  if (!latest || typeof next !== 'object' || next === null || 'kind' in next) return false;
  const { id, token } = next as { id?: unknown; token?: TokenSource };
  if (id !== (opened as { id: string }).id || token === undefined) return false;
  latest.token = token;
  return true;
}
