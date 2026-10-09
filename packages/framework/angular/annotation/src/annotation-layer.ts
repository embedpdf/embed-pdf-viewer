/**
 * `<epdf-annotation-layer>`: a page's annotations, the selection's outline and handles, the
 * tool's preview, and the text boxes being typed in. Put it in each page, above the rendered
 * page; while it's there, the render layer leaves the annotations out of the page's picture:
 *
 *   <ng-template epdfPage>
 *     <epdf-render-layer />
 *     <epdf-annotation-layer />
 *   </ng-template>
 *
 * Pure paint: it reads the plugin's items and chrome for the page and draws them. The pointer
 * reaches the plugin through the interaction hub (the Stage forwards it), and so does the
 * cursor. Each annotation is one drawing: its vector scene, the engine's baked picture, or a
 * look of yours from an `<ng-template [epdfAnnotation]>` inside the layer, which may keep the
 * layer's own drawing (`native`) and add to it. `<ng-template epdfHandle>` and
 * `<ng-template epdfRotationHandle>` draw the handles your way.
 *
 * What isn't Angular is `@embedpdf/web`'s, the same for every framework: which drawing each
 * annotation gets and the behaviors interactive looks register, the frames and chrome in
 * pixels, the scene as SVG elements, the text box editor, and the object URLs of baked pictures
 * and the stamp ghost.
 */
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  effect,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { annotationKey } from '@embedpdf/core';
import type { RenderItem } from '@embedpdf/core-annotation';
import {
  CapabilityBinding,
  injectKernelHost,
  injectPage,
  paintsPagePart,
} from '@embedpdf/angular/runtime';
import type { Annotation, TextItem } from '@embedpdf/plugin-annotation';
import { previewBucket } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import {
  annotationChromePaint,
  annotationDrawingOf,
  bakedAppearanceOf,
  editingTextKeyOf,
  frameInPixels,
  ghostOpacity,
  layerTextBoxesOf,
  loadAppearanceUrls,
  loadObjectUrl,
  lookFrameOf,
  rectInPixels,
  registerRendererBehaviors,
  type AppearanceUrl,
  type FramePixels,
} from '@embedpdf/web';
import { EpdfAnnotationChrome } from './chrome';
import { EpdfAnnotationFrame, EpdfAnnotationNative } from './drawing';
import { annotationHostOf, pagePixelsOf, pageViewOf } from './page-reads';
import { injectChromeSettings } from './settings';
import {
  EpdfAnnotationBehaviorTemplate,
  EpdfAnnotationTemplate,
  EpdfHandleTemplate,
  EpdfRotationHandleTemplate,
  type AnnotationFrame,
  type AnnotationRendererEntry,
} from './templates';
import { EPDF_LOOK_SCALE, EpdfFreeTextBox } from './text-box';

const NO_ITEMS: readonly RenderItem[] = Object.freeze([]);
const NO_TEXTS: readonly TextItem[] = Object.freeze([]);
const NO_URLS: Readonly<Record<string, AppearanceUrl>> = Object.freeze({});

/** Your look of one annotation, with what its template gets. */
interface DrawnLook {
  readonly template: EpdfAnnotationTemplate;
  readonly annotation: Annotation;
  readonly frame: AnnotationFrame;
  /** Drawn at the annotation's 100% size, and scaled by the layer. */
  readonly scaled: boolean;
  /** Tells a rich text editor in the look how much the look is scaled. */
  readonly injector: Injector;
}

/** One annotation as the template draws it. */
interface Drawn {
  readonly item: RenderItem;
  /** Its frame in the layer's pixels. */
  readonly frame: FramePixels;
  /** The engine's picture of it, once loaded. */
  readonly url: string | null;
  /** The same picture as a look gets it: its `appearance`. */
  readonly appearance: { url: string } | null;
  /** Your look that draws it, when one does. */
  readonly look: DrawnLook | null;
  /** A sibling plugin's template that owns it while its behavior is engaged. */
  readonly owner: {
    readonly template: EpdfAnnotationBehaviorTemplate;
    readonly annotation: Annotation;
  } | null;
  /** The look takes the pointer. */
  readonly interactive: boolean;
  /** Keep the pointer and the focus out: a look that only draws, or a plugin's own input. */
  readonly inert: boolean;
}

@Component({
  selector: 'epdf-annotation-layer',
  imports: [
    NgTemplateOutlet,
    EpdfAnnotationFrame,
    EpdfAnnotationNative,
    EpdfAnnotationChrome,
    EpdfFreeTextBox,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'position: absolute; inset: 0; display: block; pointer-events: none' },
  template: `
    @for (drawn of drawings(); track drawn.item.id) {
      <!-- The layer's own drawing of it, which a look may keep: its \`native\`. -->
      <ng-template #native>
        <epdf-annotation-native [item]="drawn.item" [url]="drawn.url" />
      </ng-template>
      @if (drawn.owner; as owner) {
        <!-- A sibling plugin's controls place themselves in the layer and take the input;
             the annotation's own drawing keeps its frame. -->
        <ng-template #framedNative>
          <div [epdfAnnotationFrame]="drawn.frame" [frameBlend]="drawn.item.blend">
            <ng-container [ngTemplateOutlet]="native" />
          </div>
        </ng-template>
        <ng-container
          [ngTemplateOutlet]="owner.template.template"
          [ngTemplateOutletContext]="{
            $implicit: owner.annotation,
            annotation: owner.annotation,
            item: drawn.item,
            page: page,
            native: framedNative,
            hovered: drawn.item.hovered ?? false,
            selected: drawn.item.selected,
            interactive: true
          }"
        />
      } @else {
        @if (drawn.look; as look) {
          <div
            [epdfAnnotationFrame]="drawn.frame"
            [frameBlend]="drawn.item.blend"
            [frameInteractive]="drawn.interactive"
            [frameInert]="drawn.inert"
          >
            <ng-template #lookTemplate>
              <ng-container
                [ngTemplateOutlet]="look.template.template"
                [ngTemplateOutletInjector]="look.injector"
                [ngTemplateOutletContext]="{
                  $implicit: look.annotation,
                  annotation: look.annotation,
                  frame: look.frame,
                  native: native,
                  appearance: drawn.appearance,
                  hovered: drawn.item.hovered ?? false,
                  selected: drawn.item.selected,
                  interactive: drawn.interactive
                }"
              />
            </ng-template>
            @if (look.scaled) {
              <!-- Drawn at the annotation's 100% size, scaled with the page as a whole. -->
              <div
                style="position: absolute; left: 0; top: 0; transform-origin: 0 0"
                [style.width.px]="drawn.frame.design.width"
                [style.height.px]="drawn.frame.design.height"
                [style.transform]="'scale(' + drawn.frame.scale + ')'"
              >
                <ng-container [ngTemplateOutlet]="lookTemplate" />
              </div>
            } @else {
              <ng-container [ngTemplateOutlet]="lookTemplate" />
            }
          </div>
        } @else {
          <!-- Inert when an engaged behavior has no template of yours: its plugin owns the
               input (a link's anchor takes the click), and the annotation keeps its own look. -->
          <div
            [epdfAnnotationFrame]="drawn.frame"
            [frameBlend]="drawn.item.blend"
            [frameInert]="drawn.inert"
          >
            <ng-container [ngTemplateOutlet]="native" />
          </div>
        }
      }
    }
    @for (text of texts(); track text.id) {
      <div [epdfFreeTextBox]="text" [outline]="textOutline()"></div>
    }
    @if (ghost(); as ghost) {
      <!-- The armed stamp, see-through, in the box a click would place it in. -->
      <img
        alt=""
        draggable="false"
        style="position: absolute; max-width: none; max-height: none; pointer-events: none; transform-origin: center"
        [attr.src]="ghost.url"
        [style.left.px]="ghost.box.left"
        [style.top.px]="ghost.box.top"
        [style.width.px]="ghost.box.width"
        [style.height.px]="ghost.box.height"
        [style.opacity]="ghost.opacity"
        [style.transform]="ghost.rotation ? 'rotate(' + ghost.rotation + 'deg)' : null"
      />
    }
    <epdf-annotation-chrome
      [handle]="handleTemplate()?.template ?? null"
      [rotationHandle]="rotationHandleTemplate()?.template ?? null"
    />
  `,
})
export class EpdfAnnotationLayer {
  protected readonly page = injectPage('<epdf-annotation-layer>');
  private readonly injector = inject(Injector);
  private readonly annotation = annotationHostOf(this.page, '<epdf-annotation-layer>');
  private readonly interaction = new CapabilityBinding(
    injectKernelHost('<epdf-annotation-layer>'),
    () => InteractionToken,
    () => this.page.documentId,
  );
  private readonly chrome = injectChromeSettings();

  // ── your templates ───────────────────────────────────────────────────────────

  private readonly looks = contentChildren(EpdfAnnotationTemplate, { descendants: true });
  private readonly behaviors = contentChildren(EpdfAnnotationBehaviorTemplate, {
    descendants: true,
  });
  protected readonly handleTemplate = contentChild(EpdfHandleTemplate, { descendants: true });
  protected readonly rotationHandleTemplate = contentChild(EpdfRotationHandleTemplate, {
    descendants: true,
  });

  /**
   * The renderer entries, in the order the templates are written: the first look that matches
   * wins. The same array while every entry stays the same.
   */
  private readonly renderers = computed(
    (): readonly AnnotationRendererEntry[] =>
      [
        ...this.behaviors().map((template) => template.renderer()),
        ...this.looks().map((template) => template.renderer()),
      ].filter((entry) => entry !== null),
    {
      equal: (left, right) =>
        left.length === right.length && left.every((entry, index) => entry === right[index]),
    },
  );
  /** Goes up when the behaviors register again, so each drawing is decided again. */
  private readonly registrations = signal(0);

  // ── what the page shows ──────────────────────────────────────────────────────

  private readonly view = pageViewOf(this.page);
  private readonly pixels = pagePixelsOf(this.page);

  private readonly items = this.annotation.select(
    (annotation) => annotation.listPageItems(this.page.ref, this.view()),
    NO_ITEMS,
  );
  private readonly allTexts = this.annotation.select(
    (annotation) => annotation.listTextItems(this.page.ref, this.view()),
    NO_TEXTS,
  );
  /** The active tool: an interactive look's function is asked about it, so a tool change redraws. */
  private readonly activeToolId = this.interaction.select(
    (interaction) => interaction.getActiveToolId() ?? '',
    '',
  );

  /** The baked pictures' URLs, by annotation key, for the page's appearance epoch and bake scale. */
  private readonly urls = signal<Readonly<Record<string, AppearanceUrl>>>(NO_URLS);
  // A move or a turn leaves the epoch as it is (the same pixels, placed elsewhere), and live
  // gestures don't touch it: nothing loads mid-drag.
  private readonly appearanceEpoch = this.annotation.select(
    (annotation) => annotation.getAppearanceEpoch(this.page.ref),
    '',
  );
  // Zoom steps inside one rung of the document's appearance lattice bake nothing again.
  private readonly bakeScale = this.annotation.select(
    (annotation) => annotation.getBakeScale(this.page.transform().renderScale),
    0,
  );

  /** The text box being typed in, by key: while it is, a look's editor takes the keys. */
  private readonly editingKey = computed(() => editingTextKeyOf(this.allTexts(), annotationKey));

  /** One injector per look, by item: kept while the item is drawn, so the look is never made again. */
  private readonly lookInjectors = new Map<string, Injector>();

  protected readonly drawings = computed((): readonly Drawn[] => {
    this.activeToolId();
    this.registrations();
    const annotation = this.annotation.capability();
    const renderers = this.renderers();
    const looks = this.looks();
    const behaviors = this.behaviors();
    const pixels = this.pixels();
    const urls = this.urls();
    const editingKey = this.editingKey();
    const drawings = this.items().map((item): Drawn => {
      const frame = frameInPixels(item.frame, pixels);
      const drawn: Drawn = {
        item,
        frame,
        url: urls[item.id]?.url ?? null,
        appearance: bakedAppearanceOf(urls, item.id),
        look: null,
        owner: null,
        interactive: false,
        inert: false,
      };
      const record = item.annotation;
      if (!record || !annotation) return drawn;
      // Ownership beats looks: an engaged behavior's template is authoritative (a form
      // plugin's controls own their DOM); looks apply only to what the layer owns, and draw
      // without the pointer. While its text box is typed in, a look's editor takes the keys.
      const typing = editingKey !== null && annotationKey(record.ref) === editingKey;
      const drawing = annotationDrawingOf(record, annotation, renderers, typing);
      switch (drawing.kind) {
        case 'native':
          return { ...drawn, inert: drawing.inert };
        case 'owned': {
          const template = behaviors.find((behavior) => behavior.renderer() === drawing.entry);
          return template ? { ...drawn, owner: { template, annotation: record } } : drawn;
        }
        case 'look': {
          const template = looks.find((look) => look.renderer() === drawing.entry);
          if (!template) return drawn;
          const scaled = drawing.entry.scale !== false;
          return {
            ...drawn,
            look: {
              template,
              annotation: record,
              frame: lookFrameOf(frame, scaled),
              scaled,
              injector: this.lookInjectorOf(item.id),
            },
            interactive: drawing.interactive,
            inert: drawing.inert,
          };
        }
      }
    });
    // Forget the injectors of looks no longer drawn: a look drawn again starts afresh.
    const drawnLooks = new Set(drawings.flatMap((drawn) => (drawn.look ? [drawn.item.id] : [])));
    for (const id of this.lookInjectors.keys()) {
      if (!drawnLooks.has(id)) this.lookInjectors.delete(id);
    }
    return drawings;
  });

  /** How much the layer scales each look, by item: 1 for a look drawn at its size on screen. */
  private readonly lookScales = computed(() => {
    const scales = new Map<string, number>();
    for (const drawn of this.drawings()) {
      if (drawn.look) scales.set(drawn.item.id, drawn.look.scaled ? drawn.frame.scale : 1);
    }
    return scales;
  });

  /** The text boxes the layer draws: not the ones a look of yours draws, which edits them there. */
  protected readonly texts = computed((): readonly TextItem[] =>
    layerTextBoxesOf(this.allTexts(), this.items(), this.renderers(), annotationKey),
  );

  protected readonly textOutline = computed(
    () => annotationChromePaint(this.chrome.chrome(), this.chrome.accent()).textOutline,
  );

  // ── the armed stamp's ghost ──────────────────────────────────────────────────

  private readonly imageGhost = this.annotation.select(
    (annotation) => annotation.getImageGhost(this.page.ref),
    null,
  );
  private readonly armedStamp = this.annotation.select(
    (annotation) => annotation.getArmedStamp(),
    null,
    Object.is,
  );
  /**
   * The ghost is a picture of vector artwork, sharp at one size: the size class that covers the
   * box's device width. The plugin keeps one picture per class, so a zoom never renders per frame.
   */
  private readonly ghostBucket = computed(() => {
    const ghost = this.imageGhost();
    return ghost ? previewBucket(ghost.box.width * this.page.transform().renderScale) : 0;
  });
  private readonly ghostUrl = signal<string | null>(null);
  protected readonly ghost = computed(() => {
    const ghost = this.imageGhost();
    const url = this.ghostUrl();
    if (!ghost || !url) return null;
    return {
      url,
      box: rectInPixels(ghost.box, this.pixels()),
      opacity: ghostOpacity(ghost.opacity),
      rotation: ghost.rot,
    };
  });

  constructor() {
    // While it's here, the page's picture leaves the annotations to it.
    paintsPagePart(() => this.page.ref, 'annotations');
    this.registerBehaviors();
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.loadAppearances();
    this.loadGhost();
  }

  /** The injector a look's template gets for one item: the look's scale, followed live. */
  private lookInjectorOf(id: string): Injector {
    let injector = this.lookInjectors.get(id);
    if (!injector) {
      const scale = computed(() => this.lookScales().get(id) ?? 1);
      injector = Injector.create({
        providers: [{ provide: EPDF_LOOK_SCALE, useValue: scale }],
        parent: this.injector,
      });
      this.lookInjectors.set(id, injector);
    }
    return injector;
  }

  /**
   * An interactive look takes the pointer through a behavior the plugin knows, registered once
   * per document and look however many pages show the layer (`@embedpdf/web` counts them). The
   * looks are the same entries on every page, so keep the functions you give `epdfAnnotation`
   * and `epdfAnnotationInteractive` in fields: a function made anew registers again.
   */
  private registerBehaviors(): void {
    effect((onCleanup) => {
      const annotation = this.annotation.capability();
      const renderers = this.renderers();
      if (annotation && renderers.length > 0) {
        onCleanup(
          untracked(() =>
            registerRendererBehaviors(annotation, renderers, () => untracked(this.activeToolId)),
          ),
        );
      }
      this.registrations.update((count) => count + 1);
    });
  }

  /**
   * The baked pictures, loaded again when the page's appearance epoch or the bake scale changes;
   * each load revokes the URLs of the one before.
   */
  private loadAppearances(): void {
    effect((onCleanup) => {
      const annotation = this.annotation.capability();
      const scale = this.bakeScale();
      this.appearanceEpoch();
      if (!annotation || !scale) return;
      const page = this.page.ref;
      onCleanup(
        untracked(() =>
          loadAppearanceUrls(
            (abort) => annotation.renderAppearances(page, scale, abort),
            annotationKey,
            (urls) => this.urls.set(urls),
          ),
        ),
      );
    });
  }

  /**
   * The armed stamp's ghost picture, for its size class. The previous class's picture stays up
   * until this one is there, so a zoom across a class boundary never flickers; a disarm drops it.
   */
  private loadGhost(): void {
    effect((onCleanup) => {
      const annotation = this.annotation.capability();
      const bucket = this.ghostBucket();
      this.armedStamp();
      if (!annotation || !bucket) {
        this.ghostUrl.set(null);
        return;
      }
      onCleanup(
        untracked(() =>
          loadObjectUrl(
            () => annotation.renderArmedStampPreview(bucket),
            (url) => this.ghostUrl.set(url),
          ),
        ),
      );
    });
  }
}
