import { getContext, setContext } from 'svelte';
import type {
  BoxedAnnotationRenderer,
  AnnotationRendererEntry,
  AnnotationRendererProps,
  AnnotationInteractionEvent,
  SelectOverrideHelpers,
} from './types';
import type { PdfAnnotationObject, Rect } from '@embedpdf/models';
import type { VertexConfig } from '../../shared/types';
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
      renderers = [...renderers.filter((r) => !ids.has(r.id)), ...entries];
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
export function createRenderer<T extends PdfAnnotationObject, P = never>(
  entry: AnnotationRendererEntry<T, P>,
): BoxedAnnotationRenderer {
  return {
    id: entry.id,
    matches: entry.matches ?? (() => false),
    component: (entry.component ?? (() => null)) as Component<AnnotationRendererProps>,
    matchesPreview: entry.matchesPreview,
    previewContainerStyle: entry.previewContainerStyle
      ? (props) => entry.previewContainerStyle!(props as { data: P; bounds: Rect; scale: number })
      : undefined,
    vertexConfig: entry.vertexConfig as VertexConfig<PdfAnnotationObject> | undefined,
    zIndex: entry.zIndex,
    defaultBlendMode: entry.defaultBlendMode,
    containerStyle: entry.containerStyle as
      | ((annotation: PdfAnnotationObject) => string)
      | undefined,
    interactionDefaults: entry.interactionDefaults,
    useAppearanceStream: entry.useAppearanceStream,
    isDraggable: entry.isDraggable,
    onDoubleClick: entry.onDoubleClick,
    selectOverride: entry.selectOverride as BoxedAnnotationRenderer['selectOverride'],
    hideSelectionMenu: entry.hideSelectionMenu as
      | ((annotation: PdfAnnotationObject) => boolean)
      | undefined,
    renderPreview: entry.renderPreview as BoxedAnnotationRenderer['renderPreview'],
    hiddenWhenLocked: entry.hiddenWhenLocked,
    renderLocked: entry.renderLocked as BoxedAnnotationRenderer['renderLocked'],
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
