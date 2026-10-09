/**
 * The annotation plugin's service and feature:
 *
 *   withAnnotation(options)       the plugin, for provideEmbedPdf() (it needs withInteraction())
 *   inject(EpdfAnnotation)        create, change and delete annotations; the State table as
 *                                 signals (`status()`, `selected()`, `hovered()`, `editing()`);
 *                                 the parts (`selection`, `draft`, `text`, `tools`, `stamps`,
 *                                 `links`); the events as streams (`created$`, …); the settings;
 *                                 and the reads a template follows (`watch(filter)`,
 *                                 `anchorOf(ref)`, `tools.defaultsOf(id)`)
 *
 * The service is both the plugin's API and its state, so the React hooks around it become
 * members: `useAnnotationList(filter)` is `annotation.watch(filter)`, `useAnnotationAnchor(ref)`
 * is `annotation.anchorOf(ref)`, `useAnnotationDefaults(id)` is `annotation.tools.defaultsOf(id)`
 * and `useAnnotationProperties()` is `annotation.selection.properties()`. Each of them takes a
 * value or a function that reads signals (`() => this.stamp().ref`), and follows it.
 */
import { Injectable, type Signal } from '@angular/core';
import {
  CapabilityBinding,
  injectDocumentScope,
  pluginService,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import {
  annotationPlugin,
  annotationState,
  AnnotationToken,
  type Annotation,
  type AnnotationAnchor,
  type AnnotationConfig,
  type AnnotationDraftApi,
  type AnnotationFilter,
  type AnnotationLinksApi,
  type AnnotationProperties,
  type AnnotationRef,
  type AnnotationSelectionApi,
  type AnnotationStampsApi,
  type AnnotationTextApi,
  type AnnotationToolsApi,
  type ToolDefaults,
  type ToolDefaultsChangedEvent,
} from '@embedpdf/plugin-annotation';
import {
  AnnotationToken as AnnotationHostToken,
  type AnnotationHostCapability,
} from '@embedpdf/plugin-annotation/contract/host';
import { sameAnnotationAnchor } from '@embedpdf/web';
import type { Observable } from 'rxjs';
import { EpdfComments } from './comments';

const NO_ANNOTATIONS: readonly Annotation[] = Object.freeze([]);
const NO_DEFAULTS: ToolDefaults = Object.freeze({});
const NO_PROPERTIES: AnnotationProperties = Object.freeze({
  properties: [],
  values: {},
  mixed: [],
});

/** `annotation.selection`: what is selected, the verbs that change it as one, and its style panel. */
export interface EpdfAnnotationSelection extends AnnotationSelectionApi {
  /**
   * What a style panel shows for the selection: `{ properties, values, mixed }`, the same as
   * `getProperties()` but as a signal, so the panel follows the selection and its changes.
   * Empty with nothing selected, and without a document.
   */
  readonly properties: Signal<AnnotationProperties>;
}

/** `annotation.tools`: the tools and their defaults, with the reads a picker follows. */
export interface EpdfAnnotationTools extends Omit<AnnotationToolsApi, 'onDefaultsChanged'> {
  /**
   * A tool's defaults, the fields its next annotation starts with, as a signal: a color picker
   * bound to it always shows the current color. Pass the id, or a function that reads it.
   * Empty without a document.
   */
  defaultsOf(id: string | (() => string)): Signal<ToolDefaults>;
  /**
   * What a style panel for a tool shows (`{ properties, values, mixed }`), as a signal. Pass the
   * id, or a function that reads it. Empty without a document.
   */
  propertiesOf(id: string | (() => string)): Signal<AnnotationProperties>;
  /** A tool's defaults changed, from your UI or your code: `toolId`, `defaults`. */
  readonly defaultsChanged$: Observable<ToolDefaultsChangedEvent>;
}

/**
 * Annotations: `create()`, `update()`, `delete()` and the rest of the Methods tables, the
 * selecting page's State table as signals (`annotation.selected()`), the parts the capability
 * has (`annotation.selection.set(refs)`, `annotation.tools.updateDefaults(id, changes)`), its
 * events as streams (`annotation.created$`), and its settings (`annotation.settings()`,
 * `annotation.updateSettings({ chrome })`). Comments have their own service, `EpdfComments`.
 *
 * Without a document the signals read empty and the methods refuse with `not-ready`. The checks
 * (`canCreate()`, `canDelete(ref)`, `selection.canGroup()`, `stamps.isArmed()`) are state:
 * read in a template, they follow the document, its permissions and the selection.
 */
@Injectable({ providedIn: 'root' })
export class EpdfAnnotation extends pluginService({
  name: 'EpdfAnnotation',
  feature: 'withAnnotation()',
  token: AnnotationToken,
  state: annotationState,
  methods: [
    'get',
    'list',
    'getAt',
    'isPending',
    'getStatus',
    'getHovered',
    'refresh',
    'create',
    'createFromSelection',
    'update',
    'delete',
    'reorder',
    'export',
    'import',
    'downloadResource',
    'setFilePickerProvider',
    'canRead',
    'canCreate',
    'canUpdate',
    'canDelete',
    'cancel',
  ],
  events: [
    'onCreated',
    'onUpdated',
    'onDeleted',
    'onReordered',
    'onResynced',
    'onWriteFailed',
    'onSelectionChanged',
    'onDraftChanged',
    'onEditingChanged',
    'onHoverChanged',
  ],
}) {
  /** The same capability, typed with the reads only framework code has (an annotation's anchor). */
  private readonly host = new CapabilityBinding<AnnotationHostCapability>(
    this.binding.host,
    () => AnnotationHostToken,
    injectDocumentScope(),
  );

  /** The selection: `set(refs)`, `update(changes)`, `delete()`, … and `properties()`. */
  readonly selection: EpdfAnnotationSelection = {
    set: this.binding.namespaceMethod('selection', 'set'),
    add: this.binding.namespaceMethod('selection', 'add'),
    selectAll: this.binding.namespaceMethod('selection', 'selectAll'),
    selectInRect: this.binding.namespaceMethod('selection', 'selectInRect'),
    clear: this.binding.namespaceMethod('selection', 'clear'),
    list: this.binding.namespaceMethod('selection', 'list'),
    update: this.binding.namespaceMethod('selection', 'update'),
    updateLink: this.binding.namespaceMethod('selection', 'updateLink'),
    getProperties: this.binding.namespaceMethod('selection', 'getProperties'),
    delete: this.binding.namespaceMethod('selection', 'delete'),
    rotateBy: this.binding.namespaceMethod('selection', 'rotateBy'),
    resetRotation: this.binding.namespaceMethod('selection', 'resetRotation'),
    group: this.binding.namespaceMethod('selection', 'group'),
    ungroup: this.binding.namespaceMethod('selection', 'ungroup'),
    canGroup: this.binding.namespaceMethod('selection', 'canGroup'),
    canUngroup: this.binding.namespaceMethod('selection', 'canUngroup'),
    getAnchor: this.binding.namespaceMethod('selection', 'getAnchor'),
    getRotationAnchor: this.binding.namespaceMethod('selection', 'getRotationAnchor'),
    // The plugin hands out the same object while nothing changes.
    properties: this.binding.select(
      (annotation) => annotation.selection.getProperties(),
      NO_PROPERTIES,
      Object.is,
    ),
  };

  /** A polygon or polyline being drawn: `get()`, `finish()`, `cancel()`. */
  readonly draft: AnnotationDraftApi = {
    get: this.binding.namespaceMethod('draft', 'get'),
    finish: this.binding.namespaceMethod('draft', 'finish'),
    cancel: this.binding.namespaceMethod('draft', 'cancel'),
  };

  /** Typing in a text box: `begin(ref)`, `end()`, `getEditing()`, `toggleFormat(format)`. */
  readonly text: AnnotationTextApi = {
    begin: this.binding.namespaceMethod('text', 'begin'),
    end: this.binding.namespaceMethod('text', 'end'),
    getEditing: this.binding.namespaceMethod('text', 'getEditing'),
    toggleFormat: this.binding.namespaceMethod('text', 'toggleFormat'),
  };

  /** The tools: `list()`, `register(tool)`, `updateDefaults(id, changes)`, `defaultsOf(id)`, … */
  readonly tools: EpdfAnnotationTools = {
    list: this.binding.namespaceMethod('tools', 'list'),
    get: this.binding.namespaceMethod('tools', 'get'),
    register: this.binding.namespaceMethod('tools', 'register'),
    getDefaults: this.binding.namespaceMethod('tools', 'getDefaults'),
    updateDefaults: this.binding.namespaceMethod('tools', 'updateDefaults'),
    getProperties: this.binding.namespaceMethod('tools', 'getProperties'),
    // The plugin hands out the same object until the tool's defaults change.
    defaultsOf: (id) => {
      const idOf = typeof id === 'function' ? id : () => id;
      return this.binding.select(
        (annotation) => annotation.tools.getDefaults(idOf()),
        NO_DEFAULTS,
        Object.is,
      );
    },
    propertiesOf: (id) => {
      const idOf = typeof id === 'function' ? id : () => id;
      return this.binding.select(
        (annotation) => annotation.tools.getProperties(idOf()),
        NO_PROPERTIES,
      );
    },
    defaultsChanged$: this.binding.stream((annotation) => annotation.tools.onDefaultsChanged),
  };

  /** Stamps from bytes: `arm(stamp)`, `disarm()`, `isArmed()`, `place(stamp, placement)`. */
  readonly stamps: AnnotationStampsApi = {
    arm: this.binding.namespaceMethod('stamps', 'arm'),
    disarm: this.binding.namespaceMethod('stamps', 'disarm'),
    isArmed: this.binding.namespaceMethod('stamps', 'isArmed'),
    place: this.binding.namespaceMethod('stamps', 'place'),
  };

  /** An annotation's link: `get(ref)`, `set(ref, target)`, `clear(ref)`. */
  readonly links: AnnotationLinksApi = {
    get: this.binding.namespaceMethod('links', 'get'),
    set: this.binding.namespaceMethod('links', 'set'),
    clear: this.binding.namespaceMethod('links', 'clear'),
  };

  /**
   * The annotations matching `filter` (some pages, one kind), in drawing order, as the user sees
   * them: a signal that keeps the same array while they stay the same. Pass the filter, or a
   * function that reads it (`() => ({ pages: [this.page()] })`). Empty without a document.
   * Call it once, in a field or the constructor, and read the signal in your template.
   */
  watch(
    filter?: AnnotationFilter | null | (() => AnnotationFilter | null | undefined),
  ): Signal<readonly Annotation[]> {
    const filterOf = typeof filter === 'function' ? filter : () => filter;
    return this.binding.select(
      (annotation) => annotation.list(filterOf() ?? undefined),
      NO_ANNOTATIONS,
    );
  }

  /**
   * An anchor for `<epdf-anchored>` that keeps a card or a badge on one annotation: its page and
   * the box around what it shows, following a move as it happens. Pass the ref, or a function
   * that reads it (`() => this.hovered()?.ref ?? null`). Null for null, or an annotation that
   * isn't here. It changes when the annotation moves, not while people scroll or zoom.
   */
  anchorOf(
    ref: AnnotationRef | null | (() => AnnotationRef | null | undefined),
  ): Signal<AnnotationAnchor | null> {
    const refOf = typeof ref === 'function' ? ref : () => ref;
    return this.host.select(
      (annotation) => {
        const target = refOf();
        return target ? annotation.getAnnotationAnchor(target) : null;
      },
      null,
      sameAnnotationAnchor,
    );
  }
}

/**
 * The annotation plugin: drawing, selecting, changing and saving annotations, and comments. It
 * works with the interaction plugin, so give `withInteraction()` too, and an
 * `<epdf-annotation-layer>` in each page:
 * `provideEmbedPdf({ engine }, withStage(), withRender(), withInteraction(), withAnnotation())`.
 */
export function withAnnotation(options?: AnnotationConfig): EmbedPdfFeature {
  return { plugins: [annotationPlugin(options)], services: [EpdfAnnotation, EpdfComments] };
}
