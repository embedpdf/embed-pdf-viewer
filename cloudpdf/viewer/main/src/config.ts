/**
 * The cloud door's vocabulary: its config and its documents.
 *
 * The CloudPDF viewer is the open-source viewer with the cloud engine as its default, as
 * `@embedpdf/viewer` is the same viewer with the built-in engine. So the config is the viewer's,
 * in this engine's words: `engine` takes the cloud engine's settings (where your CloudPDF runs,
 * CloudPDF SaaS when you name none), and a document is one your CloudPDF holds, named by a token,
 * by its id or by a share link. The token says who the user is and what they may do, so there is
 * no `scope` or `identity`.
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
 * `token` (or this one) must allow; or with a share link from the dashboard (`shr_…`), with
 * its passphrase when it has one, and `restart` to start over on a link that keeps each
 * visitor's layer. A token is a string, or a function that gives a fresh one when the old one
 * runs out.
 */
export type DocumentSrc =
  | { readonly token: TokenSource }
  | { readonly id: string; readonly token?: TokenSource }
  | { readonly shareToken: string; readonly sharePassword?: string; readonly restart?: boolean };

/** One of the documents `documents` opens, each in a tab of its own. */
export type DocumentEntry = ViewerDocumentEntry<DocumentSrc>;

/**
 * The cloud viewer's config: every key of the viewer's, with its documents in the cloud's words
 * (`src: { token }`, `{ id }` or `{ shareToken }`), and `engine` for the cloud engine's settings:
 * `baseUrl` (CloudPDF SaaS when left out), the engine's own `token`, `fetch`. An engine you made
 * yourself, or a function that makes one, goes there too.
 */
export interface ViewerConfig extends Omit<ViewerConfigBase<DocumentSrc>, 'scope' | 'identity'> {
  engine?: CloudEngineOptions | Engine | EngineFactory;
}

export interface InitOptions extends ViewerConfig, MountTarget {}

/**
 * What the cloud engine opens for a document: `{ kind: 'token' }`, `{ kind: 'id' }` or
 * `{ kind: 'share' }`. Anything else (an open input already, or what the element reads itself)
 * opens as it is.
 */
export function openInputOf(src: ElementSrc): ElementSrc {
  if (typeof src !== 'object' || src === null || 'kind' in src) return src;
  if ('shareToken' in src && typeof src.shareToken === 'string') {
    const { shareToken, sharePassword, restart } = src as {
      shareToken: string;
      sharePassword?: string;
      restart?: boolean;
    };
    return {
      kind: 'share',
      shareToken,
      ...(sharePassword !== undefined ? { sharePassword } : {}),
      ...(restart ? { restart } : {}),
    } satisfies OpenInput;
  }
  if ('id' in src && typeof src.id === 'string') {
    const { id, token } = src as { id: string; token?: TokenSource };
    return { kind: 'id', id, ...(token !== undefined ? { token } : {}) } satisfies OpenInput;
  }
  if ('token' in src) {
    return { kind: 'token', token: (src as { token: TokenSource }).token } satisfies OpenInput;
  }
  return src;
}
