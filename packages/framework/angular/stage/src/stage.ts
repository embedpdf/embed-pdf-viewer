/**
 * `<epdf-stage>`: shows the document's pages. It lays them out, keeps only the visible ones
 * mounted, handles scrolling, zoom and page navigation by mouse, keyboard and touch, and draws
 * each page with your `<ng-template epdfPage>`.
 *
 * The component is the Stage's API, `EpdfStageRef`'s (`stage-ref.ts`): every method of the
 * Stage page's Methods table, every value of its State table as a signal, its settings as
 * `settings()`, and its events as streams (`pageChanged$`). From around it, a template reference
 * (`<epdf-stage #stage="epdfStage">`, then `stage.zoomIn()` and `stage.zoomLevel()`) or
 * `viewChild(EpdfStage)` reaches it; from inside it, `inject(EpdfStageRef)`. `[(page)]` and
 * `[(zoom)]` bind the current page index and the zoom level.
 *
 * `[document]` opens a document for this Stage and follows the value: a new source opens, the
 * old document closes. `[token]` makes it a second view, registered with `withStage({ token })`.
 *
 * Without a document it shows no pages and its signals read their empty values; a method
 * called then refuses with `not-ready`.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  forwardRef,
  inject,
  Injectable,
  input,
  output,
  PLATFORM_ID,
  signal,
  untracked,
  type Signal,
  type TemplateRef,
} from '@angular/core';
import { shallowEqual } from '@embedpdf/core';
import type { OpenSource } from '@embedpdf/core';
import type { PageFrame } from '@embedpdf/core-geometry';
import { createScrollHandler, createZoomDragHandler, StageToken } from '@embedpdf/plugin-stage';
import type { VisiblePage } from '@embedpdf/plugin-stage';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { createStageSurface, stageViewProjector, ZOOM_BOX_DASH, zoomBoxPaint } from '@embedpdf/web';
import {
  CapabilityBinding,
  EPDF_DOCUMENT_SCOPE,
  EPDF_SCOPED_SERVICES,
  type EpdfDocumentScopeRef,
} from '@embedpdf/angular/runtime';
import { EPDF_PROJECTOR, type EpdfProjectorBinding } from '@embedpdf/angular/anchored';
import { EpdfPageSurface } from './page-surface';
import { EpdfStageRef, type StageTokenProp } from './stage-ref';
import { EpdfPageChrome, EpdfPageTemplate, type EpdfPageTemplateContext } from './templates';

const NO_PAGES: readonly VisiblePage[] = Object.freeze([]);
const NO_FRAME: PageFrame = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
const FOLLOW_ACCENT = Object.freeze({ fill: null, stroke: null });
const frameEqual = (left: PageFrame, right: PageFrame) =>
  left.top === right.top &&
  left.right === right.right &&
  left.bottom === right.bottom &&
  left.left === right.left;

/**
 * The document a Stage shows: the one its `[document]` opened, else its scope's. The Stage and
 * what's inside it read it, so it's made before the Stage itself.
 */
@Injectable()
class StageDocument implements EpdfDocumentScopeRef {
  private readonly parent = inject(EPDF_DOCUMENT_SCOPE, { optional: true, skipSelf: true });
  /** The document `[document]` opened, once it has its id. */
  readonly opened = signal<string | null>(null);
  readonly id = computed(() => this.opened() ?? this.parent?.id() ?? null);
}

@Component({
  selector: 'epdf-stage',
  exportAs: 'epdfStage',
  imports: [EpdfPageSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    // The services inside act on this Stage's document. After them, so it wins over the
    // `EpdfStageRef` among them: what's inside injects this Stage as `EpdfStageRef`, talks to
    // its document, and projects anchored UI through its camera.
    EPDF_SCOPED_SERVICES,
    StageDocument,
    { provide: EPDF_DOCUMENT_SCOPE, useExisting: StageDocument },
    { provide: EpdfStageRef, useExisting: forwardRef(() => EpdfStage) },
    { provide: EPDF_PROJECTOR, useFactory: () => inject(EpdfStage).projection },
  ],
  host: {
    style: 'position: relative; display: block; overflow: hidden; touch-action: none;',
    '[style.cursor]': 'cursor()',
  },
  template: `
    @if (pageTemplate(); as template) {
      @for (visiblePage of pages(); track visiblePage.ref.objectNumber) {
        <epdf-page-surface
          [visiblePage]="visiblePage"
          [frame]="frame()"
          [documentId]="documentId() ?? ''"
          [stage]="hostCapability()!"
          [look]="look()"
          [pageTemplate]="template"
          [chromeTemplate]="chromeTemplate()"
        />
      }
    }
    @if (zoomBox(); as box) {
      <svg
        aria-hidden="true"
        style="position: absolute; overflow: visible; pointer-events: none;"
        [style.left.px]="box.x"
        [style.top.px]="box.y"
        [attr.width]="box.width"
        [attr.height]="box.height"
      >
        <rect
          stroke-width="1"
          [attr.width]="box.width"
          [attr.height]="box.height"
          [attr.stroke-dasharray]="zoomBoxDash"
          [style.fill]="zoomBoxStyle().fill"
          [style.stroke]="zoomBoxStyle().stroke"
        />
      </svg>
    }
    <!-- What you put inside <epdf-stage> sits over the pages, in the Stage's own box. -->
    <ng-content />
  `,
})
export class EpdfStage extends EpdfStageRef {
  /** The view to drive: a token registered with `withStage({ token })`; the main view without one. */
  readonly token = input<StageTokenProp | undefined>(undefined);
  /** A document to open for this Stage. A new value opens it and closes the one before. */
  readonly document = input<OpenSource | null | undefined>(undefined);
  /** The current page's index, from 0: `[(page)]`. Setting it goes to that page. */
  readonly page = input<number | undefined>(undefined);
  /** Another page became the current one: its index. The output half of `[(page)]`. */
  readonly pageChange = output<number>();
  /** The zoom level, `1` for 100%: `[(zoom)]`. Setting it zooms there. */
  readonly zoom = input<number | undefined>(undefined);
  /** The zoom level changed. The output half of `[(zoom)]`. */
  readonly zoomChange = output<number>();

  private readonly ownDocument = inject(StageDocument);
  /** The document this Stage shows, for what's inside it: its own `[document]`, else its scope's. */
  readonly documentScope: EpdfDocumentScopeRef = this.ownDocument;
  /** The view's capability, or null without a document. */
  protected readonly hostCapability = this.binding.capability;

  protected override view(): StageTokenProp {
    return this.token() ?? StageToken;
  }

  protected override usedAs(): string {
    return '<epdf-stage>';
  }

  // ── what the template draws ──────────────────────────────────────────────────

  /** The pages on screen, each with its place and transform: a new list every camera frame. */
  protected readonly pages = this.binding.select(
    (stage) => stage.listVisiblePages(),
    NO_PAGES,
    Object.is,
  );
  protected readonly frame = this.binding.select(
    (stage) => stage.getSettings().pageFrame,
    NO_FRAME,
    frameEqual,
  );
  protected readonly documentId = this.host.read(
    (kernel) => this.documentScope.id() ?? kernel.documents.getActiveId(),
    () => null,
  );
  /** The viewer's `page` settings: each page's background and shadow. */
  protected readonly look = computed(() => this.host.viewerSettings().page, {
    equal: shallowEqual,
  });
  /** The box the zoom tool drags, in viewport px, while its drag is a box. */
  protected readonly zoomBox = this.binding.select((stage) => stage.getZoomBox(), null, Object.is);
  private readonly zoomBoxColors = this.binding.select(
    (stage) => stage.getSettings().zoomBox,
    FOLLOW_ACCENT,
    Object.is,
  );
  /** The box's fill and stroke: the `zoomBox` setting, following the viewer's accent. */
  protected readonly zoomBoxStyle = computed(() =>
    zoomBoxPaint(this.zoomBoxColors(), this.host.viewerSettings().accent),
  );
  protected readonly zoomBoxDash = ZOOM_BOX_DASH;
  private readonly pageTemplateDirective = contentChild(EpdfPageTemplate);
  private readonly chromeTemplateDirective = contentChild(EpdfPageChrome);
  // Typed, so the built declarations name `EpdfPageTemplateContext` from this file instead of
  // importing this entry point by its own package name.
  protected readonly pageTemplate: Signal<TemplateRef<EpdfPageTemplateContext> | null> = computed(
    () => this.pageTemplateDirective()?.template ?? null,
  );
  protected readonly chromeTemplate: Signal<TemplateRef<EpdfPageTemplateContext> | null> = computed(
    () => this.chromeTemplateDirective()?.template ?? null,
  );

  // ── input ────────────────────────────────────────────────────────────────────
  // How this view takes pointer input is its own settings: a change binds the surface again.

  private readonly interaction = this.binding.select(
    (stage) => stage.getSettings().interaction,
    true,
  );
  private readonly panFallback = this.binding.select(
    (stage) => stage.getSettings().panFallback,
    true,
  );
  private readonly zoomGestures = this.binding.select(
    (stage) => stage.getSettings().zoomGestures,
    true,
  );
  /** The interaction hub of this Stage's document: the active tool takes the pointer. */
  private readonly hub = new CapabilityBinding(
    this.host,
    () => InteractionToken,
    this.documentScope.id,
  ).capability;
  private readonly usesHub = computed(() => this.interaction() && this.hub() !== null);
  private readonly hubCursor = this.host.read(
    () => this.hub()?.getCursor() ?? 'default',
    () => 'default',
  );
  /** The hub's cursor (text, grab, a tool's own), while the hub takes this Stage's pointer. */
  protected readonly cursor = computed(() => (this.usesHub() ? this.hubCursor() : null));

  // ── anchored UI ──────────────────────────────────────────────────────────────

  /**
   * How anchored UI (`<epdf-anchored>`) inside the Stage follows the camera: a projection
   * through the view, and the visible pages as its revision, so the pages and the UI on them
   * update in the same change detection pass and never a frame apart.
   */
  readonly projection: EpdfProjectorBinding = {
    // `@embedpdf/web`'s Stage projection, shared by every framework: page boxes to the Stage's
    // own coordinates.
    projector: computed(() => {
      const stage = this.hostCapability();
      return stage ? stageViewProjector(() => stage) : null;
    }),
    revision: this.pages,
    shownPages: computed(
      () => {
        const shown = this.pages().map((visible) => visible.ref.objectNumber);
        return new Set(shown);
      },
      // The same set until a page comes on screen or leaves it.
      {
        equal: (left, right) =>
          left.size === right.size && [...left].every((objectNumber) => right.has(objectNumber)),
      },
    ),
  };

  constructor() {
    super();
    this.followDocumentInput();
    this.followPageAndZoom();
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.bindSurface();
  }

  /** `[document]`: open it for this Stage once the viewer runs; close it when the value changes. */
  private followDocumentInput(): void {
    effect((onCleanup) => {
      const source = this.document();
      const kernel = this.host.kernel();
      if (!source || !kernel || this.host.status() !== 'ready') return;
      untracked(() => {
        const cancel = new AbortController();
        const opening = kernel.documents.open(source, { signal: cancel.signal });
        // The new tab is the active one at once; its id is final when the open resolves.
        let id = kernel.documents.getActiveId();
        opening.then(
          ({ document }) => {
            id = document.id;
            if (!cancel.signal.aborted) this.ownDocument.opened.set(document.id);
          },
          () => {
            // Its tab shows why it couldn't be opened.
          },
        );
        onCleanup(() => {
          cancel.abort();
          this.ownDocument.opened.set(null);
          if (id && kernel.documents.has(id)) void kernel.documents.close(id).catch(() => {});
        });
      });
    });
  }

  /**
   * `[(page)]` and `[(zoom)]`. A value from the parent moves the view there; a move of the view
   * (scroll, pinch, a button) goes out as `pageChange` and `zoomChange`. When the Stage changes
   * documents (another tab), the new document keeps its own place and reports it.
   */
  private followPageAndZoom(): void {
    let previous: StageHostCapability | null = null;
    effect(() => {
      const stage = this.hostCapability();
      const page = this.page();
      const zoom = this.zoom();
      untracked(() => {
        const switched = previous !== null && stage !== null && stage !== previous;
        previous = stage;
        if (!stage) return;
        if (switched) {
          if (page !== undefined && page !== stage.getCurrentPageIndex()) {
            this.pageChange.emit(stage.getCurrentPageIndex());
          }
          if (zoom !== undefined && zoom !== stage.getZoomLevel()) {
            this.zoomChange.emit(stage.getZoomLevel());
          }
          return;
        }
        if (page !== undefined && page !== stage.getCurrentPageIndex()) stage.goToPage(page);
        if (zoom !== undefined && zoom !== stage.getZoomLevel()) stage.zoomTo(zoom);
      });
    });
    effect((onCleanup) => {
      const stage = this.hostCapability();
      if (!stage) return;
      const offPage = stage.onPageChanged(({ pageIndex }) => this.pageChange.emit(pageIndex));
      const offZoom = stage.onZoomChanged(({ level }) => this.zoomChange.emit(level));
      onCleanup(() => {
        offPage();
        offZoom();
      });
    });
  }

  /**
   * The browser side: the viewport size and pixel ratio, wheel and touch gestures, and the
   * pointer going to the interaction hub. All of it is `@embedpdf/web`'s, shared by every
   * framework, so the Stage feels the same everywhere; this binds it again when the view, the
   * hub or the input settings change.
   */
  private bindSurface(): void {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect((onCleanup) => {
      const stage = this.hostCapability();
      const hub = this.hub();
      const usesHub = this.usesHub();
      const panFallback = this.panFallback();
      const zoomGestures = this.zoomGestures();
      if (!stage) return;
      const detachSurface = createStageSurface(element, stage, {
        hub: usesHub ? hub : null,
        source: stage.getLensId(),
        zoomGestures,
      });
      // The pointer, this view's drag-to-scroll and its zoom box go to the hub together, for
      // this view only, so two Stages on one document never scroll or zoom each other.
      const offScroll =
        usesHub && hub
          ? hub.registerHandler(createScrollHandler(stage, hub, { panFallback }), {
              source: stage.getLensId(),
            })
          : null;
      const offZoomDrag =
        usesHub && hub
          ? hub.registerHandler(createZoomDragHandler(stage, hub), { source: stage.getLensId() })
          : null;
      onCleanup(() => {
        offZoomDrag?.();
        offScroll?.();
        detachSurface();
      });
    });
  }
}
