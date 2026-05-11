import { signal } from '@angular/core';
import type { PluginRegistry } from '@embedpdf/snippet';
import { describe, expect, it, vi } from 'vitest';

import { createDocumentScopeSignal, createPluginCapabilitySignal } from './plugin-signals';

type MockZoomScope = {
  documentId: string;
  zoomIn: ReturnType<typeof vi.fn>;
  requestZoom: ReturnType<typeof vi.fn>;
};

type MockZoomCapability = {
  forDocument(documentId: string): MockZoomScope;
};

type MockZoomPlugin = {
  provides(): MockZoomCapability;
};

describe('plugin signal helpers', () => {
  it('derives a plugin capability from the registry signal', () => {
    const zoomCapability: MockZoomCapability = {
      forDocument: (documentId) => ({
        documentId,
        zoomIn: vi.fn(),
        requestZoom: vi.fn(),
      }),
    };

    const registry = signal<PluginRegistry | null>({
      getPlugin<TPlugin>(pluginId: string) {
        if (pluginId !== 'zoom') {
          return undefined;
        }

        return {
          provides: () => zoomCapability,
        } as TPlugin;
      },
    } as PluginRegistry);

    const capability = createPluginCapabilitySignal<MockZoomPlugin>(registry, 'zoom');

    expect(capability()).toBe(zoomCapability);

    registry.set(null);

    expect(capability()).toBeNull();
  });

  it('derives a document scope from a capability signal', () => {
    const capability = signal<MockZoomCapability | null>({
      forDocument: (documentId) => ({
        documentId,
        zoomIn: vi.fn(),
        requestZoom: vi.fn(),
      }),
    });
    const documentId = signal('ebook');

    const scope = createDocumentScopeSignal(capability, documentId);

    expect(scope()?.documentId).toBe('ebook');

    documentId.set('appendix');

    expect(scope()?.documentId).toBe('appendix');

    capability.set(null);

    expect(scope()).toBeNull();
  });

  it('accepts literal document ids for static examples', () => {
    const scope = createDocumentScopeSignal<MockZoomCapability>(
      {
        forDocument: (documentId) => ({
          documentId,
          zoomIn: vi.fn(),
          requestZoom: vi.fn(),
        }),
      },
      'zoom-doc',
    );

    expect(scope()?.documentId).toBe('zoom-doc');
  });
});