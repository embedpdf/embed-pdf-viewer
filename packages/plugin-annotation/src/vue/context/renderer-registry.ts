import {
  inject,
  provide,
  markRaw,
  onUnmounted,
  shallowRef,
  type InjectionKey,
  type ShallowRef,
} from 'vue';
import type { BoxedAnnotationRenderer, AnnotationRendererEntry } from './types';
import type { PdfAnnotationObject } from '@embedpdf/models';

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

const RendererRegistryKey: InjectionKey<AnnotationRendererRegistry> = Symbol(
  'AnnotationRendererRegistry',
);

export function createRendererRegistry(): AnnotationRendererRegistry {
  const renderers: ShallowRef<BoxedAnnotationRenderer[]> = shallowRef([]);

  return {
    register(entries: BoxedAnnotationRenderer[]) {
      const ids = new Set(entries.map((e) => e.id));
      // Add new, replace existing by id
      renderers.value = [...renderers.value.filter((r) => !ids.has(r.id)), ...entries];
      // Return cleanup function
      return () => {
        renderers.value = renderers.value.filter((r) => !entries.some((e) => e.id === r.id));
      };
    },
    getAll() {
      return renderers.value;
    },
  };
}

export function provideRendererRegistry(): AnnotationRendererRegistry {
  const registry = createRendererRegistry();
  provide(RendererRegistryKey, registry);
  return registry;
}

export function useRendererRegistry(): AnnotationRendererRegistry | null {
  return inject(RendererRegistryKey, null);
}

/**
 * Composable for plugins to register renderers.
 * Automatically cleans up on unmount.
 */
export function useRegisterRenderers(entries: BoxedAnnotationRenderer[]) {
  const registry = useRendererRegistry();
  if (!registry) return;

  const unregister = registry.register(entries);
  onUnmounted(unregister);
}

/**
 * Factory to create a boxed renderer from a typed entry.
 * Wraps component in markRaw to prevent reactivity overhead.
 */
export function createRenderer<T extends PdfAnnotationObject>(
  entry: AnnotationRendererEntry<T>,
): BoxedAnnotationRenderer {
  return {
    id: entry.id,
    matches: entry.matches,
    component: markRaw(entry.component) as Component<AnnotationRendererProps>,
  };
}

// Re-export types for convenience
import type { Component } from 'vue';
import type { AnnotationRendererProps } from './types';
export type { AnnotationRendererProps, AnnotationRendererEntry, BoxedAnnotationRenderer };
