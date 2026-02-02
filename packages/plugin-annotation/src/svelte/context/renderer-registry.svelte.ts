import { getContext, setContext } from 'svelte';
import type {
  BoxedAnnotationRenderer,
  AnnotationRendererEntry,
  AnnotationRendererProps,
} from './types';
import type { PdfAnnotationObject } from '@embedpdf/models';
import type { Component } from 'svelte';

/**
 * Annotation Renderer Registry
 *
 * Allows external plugins to register custom annotation renderers
 * that integrate with the annotation layer.
 */
export interface AnnotationRendererRegistry {
  register(entries: BoxedAnnotationRenderer[]): () => void;
  getAll(): BoxedAnnotationRenderer[];
}

const REGISTRY_KEY = Symbol('AnnotationRendererRegistry');

export function createRendererRegistry(): AnnotationRendererRegistry {
  let renderers = $state<BoxedAnnotationRenderer[]>([]);

  return {
    register(entries) {
      const ids = new Set(entries.map((e) => e.id));
      // Add new, replace existing by id
      renderers = [...renderers.filter((r) => !ids.has(r.id)), ...entries];
      // Return cleanup function
      return () => {
        renderers = renderers.filter((r) => !entries.some((e) => e.id === r.id));
      };
    },
    getAll() {
      return renderers;
    },
  };
}

export function provideRendererRegistry(): AnnotationRendererRegistry {
  const registry = createRendererRegistry();
  setContext(REGISTRY_KEY, registry);
  return registry;
}

export function getRendererRegistry(): AnnotationRendererRegistry | null {
  return getContext<AnnotationRendererRegistry>(REGISTRY_KEY) ?? null;
}

/**
 * Factory to create a boxed renderer from a typed entry.
 */
export function createRenderer<T extends PdfAnnotationObject>(
  entry: AnnotationRendererEntry<T>,
): BoxedAnnotationRenderer {
  return {
    id: entry.id,
    matches: entry.matches,
    component: entry.component as Component<AnnotationRendererProps>,
  };
}

// Re-export types for convenience
export type { AnnotationRendererProps, AnnotationRendererEntry, BoxedAnnotationRenderer };
