/**
 * A fake engine whose documents carry metadata: one page, a title, and one field of the app's
 * own. Enough for the metadata, page-edit and actions plugins to open a document against.
 */
import type { DocumentHandle, DocumentMetadata, Engine } from '@embedpdf/core';
import { testPage } from './counter-plugin';

export const METADATA: DocumentMetadata = {
  title: 'Q2 Proposal',
  author: null,
  subject: null,
  keywords: null,
  producer: null,
  creator: null,
  createdAt: null,
  modifiedAt: null,
  trapped: 'unknown',
};

export const CUSTOM = { contractId: 'C-2026-114' };

export const metadataEngine = {
  open: (input: { id?: string }) =>
    Promise.resolve({
      id: input.id ?? 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, pages: [testPage] }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      metadata: {
        get: () => Promise.resolve(METADATA),
        custom: { get: () => Promise.resolve(CUSTOM) },
      },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;
