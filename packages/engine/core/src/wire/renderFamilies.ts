import type { DocCapability } from '../auth/scope';
import type { LayerScopePlane } from '../dto/LayerScopes';
import {
  printDpiOf,
  type PageRenderLayers,
  type PageRenderOptions,
  type PrintDpi,
} from '../dto/PageRender';
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
  /**
   * What reading the picture needs: its own right (`doc.render` on screen,
   * `doc.render.thumbnail` for a thumbnail, the tier's for print) and the
   * rights to read what it draws, nothing else.
   */
  readonly needs: ReadonlyArray<DocCapability>;
  /**
   * The planes the picture depends on. It's read at the document's shared
   * path while a layer inherits every one of them.
   */
  readonly planes: ReadonlyArray<LayerScopePlane>;
  /** The page pins a versioned request carries: each plane's own. */
  readonly pins: ReadonlyArray<PageRenderPin>;
  /** The print tier of a print picture ({@link PAGE_PRINT_FAMILIES}); null for the screen. */
  readonly print: PagePrintTierSpec | null;
  /** A thumbnail ({@link PAGE_THUMBNAIL_FAMILIES}): the whole page at the thumbnail size. */
  readonly thumbnail: boolean;
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
    print: null,
    thumbnail: false,
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
    print: null,
    thumbnail: false,
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
    print: null,
    thumbnail: false,
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
    print: null,
    thumbnail: false,
  },
};

/** The family of a picture that draws `layers`. */
export function pageRenderFamilyOf(layers: PageRenderLayers): PageRenderFamily {
  if (layers.includeAnnotations) return layers.includeFormFields ? 'all' : 'annotations';
  return layers.includeFormFields ? 'fields' : 'pages';
}

/** The rights to read what a picture draws: whatever kind of picture it is. */
function readsOf(draws: PageRenderLayers): DocCapability[] {
  return [
    ...(draws.includeAnnotations ? (['doc.annotate.read'] as const) : []),
    ...(draws.includeFormFields ? (['doc.forms.read'] as const) : []),
  ];
}

/**
 * The thumbnails: each of the four families as a small picture of the whole
 * page, `PAGE_THUMBNAIL_SIZE` pixels on its long side, by the screen's
 * rules. A thumbnail needs `doc.render.thumbnail` (which `doc.render`
 * implies), not `doc.render`, so a session that may not render pages may
 * still have thumbnails. It keeps its family's planes and pins, and its path
 * is the family's with `thumbnail` after `render/`:
 * `render/thumbnail/annotations/pages`.
 */
export const PAGE_THUMBNAIL_FAMILIES: Readonly<Record<PageRenderFamily, PageRenderFamilySpec>> = {
  pages: thumbnailFamily('pages', 'page-thumbnail', 'layer-page-thumbnail'),
  annotations: thumbnailFamily(
    'annotations',
    'page-thumbnail-annotations',
    'layer-page-thumbnail-annotations',
  ),
  fields: thumbnailFamily('fields', 'page-thumbnail-fields', 'layer-page-thumbnail-fields'),
  all: thumbnailFamily('all', 'page-thumbnail-all', 'layer-page-thumbnail-all'),
};

/**
 * The two print tiers, named for the right each needs: `print` (150 DPI,
 * `doc.print`) and `print-high` (300 DPI, `doc.print.high`). The tier is a
 * right, so like the family it is in the path, never in the token.
 */
export type PagePrintTier = 'print' | 'print-high';

export interface PagePrintTierSpec {
  readonly tier: PagePrintTier;
  readonly dpi: PrintDpi;
  /** What the tier needs on top of its family's rights. */
  readonly needs: ReadonlyArray<DocCapability>;
}

export const PAGE_PRINT_TIERS: Readonly<Record<PagePrintTier, PagePrintTierSpec>> = {
  print: { tier: 'print', dpi: 150, needs: ['doc.print'] },
  'print-high': { tier: 'print-high', dpi: 300, needs: ['doc.print', 'doc.print.high'] },
};

/** The tier that prints at `dpi`. */
export function pagePrintTierOf(dpi: PrintDpi): PagePrintTier {
  return dpi === 300 ? 'print-high' : 'print';
}

/**
 * The print pictures: each of the four families, printed at each tier. A
 * print picture draws what its family draws, by the print rules: layers in
 * their print state, annotations and fields by their `print` flag. So no
 * print family is a screen picture under another name. Each needs its tier's
 * rights and the rights to read what it draws, and not `doc.render`: printing
 * is its own right. It keeps its family's planes and pins, and its path is
 * the family's with the tier after `render/`:
 * `render/print-high/annotations/pages`.
 */
export const PAGE_PRINT_FAMILIES: Readonly<
  Record<PagePrintTier, Readonly<Record<PageRenderFamily, PageRenderFamilySpec>>>
> = {
  print: {
    pages: printFamily('print', 'pages', 'page-print', 'layer-page-print'),
    annotations: printFamily(
      'print',
      'annotations',
      'page-print-annotations',
      'layer-page-print-annotations',
    ),
    fields: printFamily('print', 'fields', 'page-print-fields', 'layer-page-print-fields'),
    all: printFamily('print', 'all', 'page-print-all', 'layer-page-print-all'),
  },
  'print-high': {
    pages: printFamily('print-high', 'pages', 'page-print-high', 'layer-page-print-high'),
    annotations: printFamily(
      'print-high',
      'annotations',
      'page-print-high-annotations',
      'layer-page-print-high-annotations',
    ),
    fields: printFamily(
      'print-high',
      'fields',
      'page-print-high-fields',
      'layer-page-print-high-fields',
    ),
    all: printFamily('print-high', 'all', 'page-print-high-all', 'layer-page-print-high-all'),
  },
};

/** Every page picture: the four screen families, their four thumbnails and the eight print ones. */
export const PAGE_PICTURES: ReadonlyArray<PageRenderFamilySpec> = [
  ...Object.values(PAGE_RENDER_FAMILIES),
  ...Object.values(PAGE_THUMBNAIL_FAMILIES),
  ...Object.values(PAGE_PRINT_FAMILIES).flatMap((tier) => Object.values(tier)),
];

/**
 * The picture that draws `layers` at the size `options` asks for: printed at
 * its DPI, a thumbnail, or for the screen.
 */
export function pagePictureOf(
  layers: PageRenderLayers,
  options: Pick<PageRenderOptions, 'usage' | 'viewport'> | undefined,
): PageRenderFamilySpec {
  const family = pageRenderFamilyOf(layers);
  const printDpi = printDpiOf(options);
  if (printDpi !== undefined) return PAGE_PRINT_FAMILIES[pagePrintTierOf(printDpi)][family];
  return options?.viewport?.kind === 'thumbnail'
    ? PAGE_THUMBNAIL_FAMILIES[family]
    : PAGE_RENDER_FAMILIES[family];
}

function thumbnailFamily(
  family: PageRenderFamily,
  resource: DocResourceId,
  layerResource: DocResourceId,
): PageRenderFamilySpec {
  const screen = PAGE_RENDER_FAMILIES[family];
  return {
    ...screen,
    resource,
    layerResource,
    path: `render/thumbnail/${screen.path.slice('render/'.length)}`,
    needs: ['doc.render.thumbnail', ...readsOf(screen.draws)],
    thumbnail: true,
  };
}

function printFamily(
  tier: PagePrintTier,
  family: PageRenderFamily,
  resource: DocResourceId,
  layerResource: DocResourceId,
): PageRenderFamilySpec {
  const screen = PAGE_RENDER_FAMILIES[family];
  const print = PAGE_PRINT_TIERS[tier];
  return {
    ...screen,
    resource,
    layerResource,
    path: `render/${tier}/${screen.path.slice('render/'.length)}`,
    needs: [...print.needs, ...readsOf(screen.draws)],
    print,
  };
}
