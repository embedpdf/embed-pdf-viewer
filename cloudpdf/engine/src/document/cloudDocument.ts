/**
 * The cloud side of an open document, beyond the engine's own document API:
 * the routes of the server modules installed with the CloudPDF server, the
 * server half of a plugin. Only a document open on the cloud engine has one,
 * so importing `cloudDocument` is what makes a viewer plugin cloud-only.
 */
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';

/** A server module's routes on one document's layer. */
export interface ModuleChannel {
  /**
   * `fetch` for the module's routes: `path` is below
   * `/v1/docs/{docId}/layers/{layerName}/{module id}/`, query included. It
   * sends the document's token and answers a plain `Response`, whatever its
   * status. Always to the server, never through a CDN.
   */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

/** What the cloud engine adds to an open document. */
export interface CloudDocument {
  /** The routes of the server module `id` for this document. `InvalidArg` for an id that can't be a module's. */
  module(id: string): ModuleChannel;
}

/** Where a cloud document keeps its cloud side: one key for every copy of this package. */
export const CLOUD_DOCUMENT: unique symbol = Symbol.for('@cloudpdf/engine/cloud-document');

/**
 * The cloud side of `document`, or `null` when it isn't open on the cloud
 * engine (the local engine has no server). A viewer plugin passes its own
 * `ctx.doc`, and its calls stop when the document closes.
 */
export function cloudDocument(document: DocumentHandle): CloudDocument | null {
  return (document as { readonly [CLOUD_DOCUMENT]?: CloudDocument })[CLOUD_DOCUMENT] ?? null;
}
