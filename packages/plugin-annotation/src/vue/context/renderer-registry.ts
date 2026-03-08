import {
  inject,
  provide,
  markRaw,
  onUnmounted,
  shallowRef,
  type InjectionKey,
  type ShallowRef,
  type Component,
  type CSSProperties,
} from 'vue';
import type {
  BoxedAnnotationRenderer,
  AnnotationRendererEntry,
  AnnotationRendererProps,
  AnnotationInteractionEvent,
  SelectOverrideHelpers,
} from './types';
import type { PdfAnnotationObject } from '@embedpdf/models';
import type { VertexConfig } from '../../shared/types';

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
      renderers.value = [...renderers.value.filter((r) => !ids.has(r.id)), ...entries];
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
    vertexConfig: entry.vertexConfig as VertexConfig<PdfAnnotationObject> | undefined,
    zIndex: entry.zIndex,
    defaultBlendMode: entry.defaultBlendMode,
    containerStyle: entry.containerStyle as
      | ((annotation: PdfAnnotationObject) => CSSProperties)
      | undefined,
    interactionDefaults: entry.interactionDefaults,
    useAppearanceStream: entry.useAppearanceStream,
    isDraggable: entry.isDraggable,
    onDoubleClick: entry.onDoubleClick,
    selectOverride: entry.selectOverride as BoxedAnnotationRenderer['selectOverride'],
    hideSelectionMenu: entry.hideSelectionMenu as
      | ((annotation: PdfAnnotationObject) => boolean)
      | undefined,
  };
}

// Re-export types for convenience
export type {
  AnnotationRendererProps,
  AnnotationRendererEntry,
  BoxedAnnotationRenderer,
  AnnotationInteractionEvent,
  SelectOverrideHelpers,
};
