import type { DocCapability } from '../auth/scope';
import type { LayerScopePlane } from '../dto/LayerScopes';
import type { PageRenderLayers } from '../dto/PageRender';
import type { DocResourceId } from './resources';

/**
 * The four page pictures, by what they draw beside the page content: nothing
 * (`pages`), the annotations (`annotations`), the form fields (`fields`), or
 * both (`all`). The family is in the path, never in the token. Who may see a
 * picture and which planes it depends on differ per family, and a CDN grant
 * is a path prefix.
 */
export type PageRenderFamily = 'pages' | 'annotations' | 'fields' | 'all';

/** A page pin a picture's token carries. */
export type PageRenderPin = 'contentVersion' | 'annotationVersion' | 'widgetVersion';

export interface PageRenderFamilySpec {
  readonly family: PageRenderFamily;
  /** Its resource at the document's shared path, and at a layer's. */
  readonly resource: DocResourceId;
  readonly layerResource: DocResourceId;
  /** What the picture draws beside the page content. */
  readonly draws: PageRenderLayers;
  /** The path between the document and the page key: `render/annotations/pages`. */
  readonly path: string;
  /** What reading the picture needs. */
  readonly needs: ReadonlyArray<DocCapability>;
  /**
   * The planes the picture depends on. It's read at the document's shared
   * path while a layer inherits every one of them.
   */
  readonly planes: ReadonlyArray<LayerScopePlane>;
  /** The page pins a versioned request carries: each plane's own. */
  readonly pins: ReadonlyArray<PageRenderPin>;
}

export const PAGE_RENDER_FAMILIES: Readonly<Record<PageRenderFamily, PageRenderFamilySpec>> = {
  pages: {
    family: 'pages',
    resource: 'page-render',
    layerResource: 'layer-page-render',
    draws: { includeAnnotations: false, includeFormFields: false },
    path: 'render/pages',
    needs: ['doc.render'],
    planes: ['content'],
    pins: ['contentVersion'],
  },
  annotations: {
    family: 'annotations',
    resource: 'page-render-annotations',
    layerResource: 'layer-page-render-annotations',
    draws: { includeAnnotations: true, includeFormFields: false },
    path: 'render/annotations/pages',
    needs: ['doc.render', 'doc.annotate.read'],
    planes: ['content', 'annotations'],
    pins: ['contentVersion', 'annotationVersion'],
  },
  fields: {
    family: 'fields',
    resource: 'page-render-fields',
    layerResource: 'layer-page-render-fields',
    draws: { includeAnnotations: false, includeFormFields: true },
    path: 'render/fields/pages',
    needs: ['doc.render', 'doc.forms.read'],
    planes: ['content', 'forms'],
    pins: ['contentVersion', 'widgetVersion'],
  },
  all: {
    family: 'all',
    resource: 'page-render-all',
    layerResource: 'layer-page-render-all',
    draws: { includeAnnotations: true, includeFormFields: true },
    path: 'render/all/pages',
    needs: ['doc.render', 'doc.annotate.read', 'doc.forms.read'],
    planes: ['content', 'annotations', 'forms'],
    pins: ['contentVersion', 'annotationVersion', 'widgetVersion'],
  },
};

/** The family of a picture that draws `layers`. */
export function pageRenderFamilyOf(layers: PageRenderLayers): PageRenderFamily {
  if (layers.includeAnnotations) return layers.includeFormFields ? 'all' : 'annotations';
  return layers.includeFormFields ? 'fields' : 'pages';
}
