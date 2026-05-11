import { computed, type Signal } from '@angular/core';
import type { PluginRegistry } from '@embedpdf/snippet';

type ValueOrSignal<T> = T | (() => T);
type PluginWithProvides = { id: string; provides(): unknown };
type DocumentScopedCapability = { forDocument(documentId: string): unknown };

export type PluginCapability<TPlugin extends PluginWithProvides> = TPlugin extends {
  provides(): infer TCapability;
}
  ? TCapability
  : never;

export type DocumentScope<TCapability extends DocumentScopedCapability> = TCapability extends {
  forDocument(documentId: string): infer TScope;
}
  ? TScope
  : never;

/**
 * Derives a plugin capability from a viewer registry signal.
 *
 * This is a lightweight bridge for wrapper-based integrations that want to compose
 * Angular signals around the viewer registry while the full headless `inject*()`
 * helpers are still on the roadmap.
 */
export function createPluginCapabilitySignal<TPlugin extends PluginWithProvides>(
  registry: ValueOrSignal<PluginRegistry | null | undefined>,
  pluginId: string,
): Signal<PluginCapability<TPlugin> | null> {
  return computed<PluginCapability<TPlugin> | null>(() => {
    const plugin = readValue(registry)?.getPlugin<TPlugin>(pluginId);
    return (plugin?.provides() ?? null) as PluginCapability<TPlugin> | null;
  });
}

/**
 * Derives a document-scoped capability from a plugin capability signal.
 */
export function createDocumentScopeSignal<TCapability extends DocumentScopedCapability>(
  capability: ValueOrSignal<TCapability | null | undefined>,
  documentId: ValueOrSignal<string | null | undefined>,
): Signal<DocumentScope<TCapability> | null> {
  return computed(() => {
    const resolvedCapability = readValue(capability);
    const resolvedDocumentId = readValue(documentId);

    if (!resolvedCapability || !resolvedDocumentId) {
      return null;
    }

    return resolvedCapability.forDocument(resolvedDocumentId) as DocumentScope<TCapability>;
  });
}

function readValue<T>(value: ValueOrSignal<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}