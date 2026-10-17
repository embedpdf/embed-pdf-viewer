/**
 * `<epdf-selection-handles>`: the handles at both ends of the selection, as phones draw them, so
 * a finger can grow or shrink it. Put it inside `<epdf-stage>`, next to the selection menu.
 *
 * Each handle is the selection's own edge, a thin bar the height of the text at that end (it
 * turns with turned text and turned pages), with a round grip above the first line at the start
 * and below the last line at the end. Dragging one extends the selection from the other end,
 * through the same gesture a pointer drag uses, so the highlight, the menu and the events all
 * behave the same. A press on a handle never scrolls the Stage.
 *
 * What's decided is the selection plugin's (`selectionHandleViewOf`, `selectionHandleEndpointsOf`,
 * `selectionHandleGeom`, `armSelectionHandle`) and the listener mechanics are `@embedpdf/web`'s
 * (`attachSelectionHandle`); this file keeps
 * the markup and the colors: the plugin's `handles` setting, the accent while its color is
 * unset, and the `--epdf-text-selection-handle` and `--epdf-text-selection-handle-shadow` CSS
 * variables over both.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { CapabilityToken } from '@embedpdf/core';
import {
  armSelectionHandle,
  HANDLE_BAR,
  HANDLE_HEAD,
  HANDLE_PAD,
  SELECTION_DEFAULTS,
  selectionHandleEndpointsOf,
  selectionHandleGeom,
  selectionHandleViewOf,
  type SelectionHandleEndpoint,
  type SelectionHandleView,
} from '@embedpdf/plugin-selection';
import {
  SelectionToken as SelectionHostToken,
  type SelectionHostCapability,
} from '@embedpdf/plugin-selection/contract/host';
import { StageToken, type StageCapability } from '@embedpdf/plugin-stage/contract';
import { attachSelectionHandle, paint, sameSelectionEndpoints } from '@embedpdf/web';
import type { SelectionHandleSession } from '@embedpdf/web';
import {
  CapabilityBinding,
  devWarn,
  injectDocumentScope,
  injectKernelHost,
} from '@embedpdf/angular/runtime';
import { EPDF_PROJECTOR } from '@embedpdf/angular/anchored';
import { EpdfStage } from '@embedpdf/angular/stage';

type Role = 'start' | 'end';

/** One handle, laid out in the Stage's own box. */
interface HandleLayout {
  readonly role: Role;
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly barTop: number;
  readonly barHeight: number;
  readonly headTop: number;
  /** Null for upright text: an upright handle carries no transform. */
  readonly transform: string | null;
  readonly transformOrigin: string | null;
}

const NO_HANDLES: readonly HandleLayout[] = Object.freeze([]);

/** What a press on a handle starts: the point it grabbed (the bar's middle), and the drag. */
export type SelectionGripDrag = {
  readonly base: { readonly x: number; readonly y: number };
  readonly session: SelectionHandleSession;
} | null;

/**
 * Binds the drag to one handle element. `arm` is read when a press comes, so it always works
 * with the selection as it is then.
 */
@Directive({ selector: '[epdfSelectionGrip]' })
export class EpdfSelectionGrip {
  readonly arm = input.required<() => SelectionGripDrag>({
    alias: 'epdfSelectionGrip',
  });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    inject(DestroyRef).onDestroy(attachSelectionHandle(element, { arm: () => this.arm()() }));
  }
}

@Component({
  selector: 'epdf-selection-handles',
  imports: [EpdfSelectionGrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (handle of handles(); track handle.role) {
      <div
        style="position: absolute; touch-action: none; cursor: grab; pointer-events: auto"
        [epdfSelectionGrip]="handle.role === 'start' ? armStart : armEnd"
        [style.left.px]="handle.left"
        [style.top.px]="handle.top"
        [style.width.px]="gripWidth"
        [style.height.px]="handle.height"
        [style.transform]="handle.transform"
        [style.transform-origin]="handle.transformOrigin"
      >
        <!-- The bar: the selection's own edge, as tall as the text at that end. -->
        <div
          style="position: absolute"
          [style.left.px]="pad"
          [style.top.px]="handle.barTop"
          [style.width.px]="bar"
          [style.height.px]="handle.barHeight"
          [style.border-radius.px]="bar / 2"
          [style.background]="color()"
        ></div>
        <!-- The grip: against the bar, above the text at the start, below it at the end. -->
        <div
          style="position: absolute; border-radius: 50%"
          [style.left.px]="pad + bar / 2 - head / 2"
          [style.top.px]="handle.headTop"
          [style.width.px]="head"
          [style.height.px]="head"
          [style.background]="color()"
          [style.box-shadow]="shadow()"
        ></div>
      </div>
    }
  `,
})
export class EpdfSelectionHandles {
  /** The view the handles are drawn over: the Stage they're in, unless you name another. */
  readonly token = input<CapabilityToken<StageCapability> | undefined>(undefined);

  protected readonly pad = HANDLE_PAD;
  protected readonly bar = HANDLE_BAR;
  protected readonly head = HANDLE_HEAD;
  protected readonly gripWidth = HANDLE_BAR + 2 * HANDLE_PAD;

  private readonly host = injectKernelHost('<epdf-selection-handles>');
  private readonly enclosingStage = inject(EpdfStage, { optional: true });
  /** How the surface it's in places things: the Stage's camera, or nothing to project through. */
  private readonly projection = inject(EPDF_PROJECTOR, { optional: true });
  private readonly documentId = injectDocumentScope();

  private readonly selection = new CapabilityBinding<SelectionHostCapability>(
    this.host,
    () => SelectionHostToken,
    this.documentId,
  );
  private readonly stage = new CapabilityBinding<StageCapability>(
    this.host,
    () => this.token() ?? this.enclosingStage?.token() ?? StageToken,
    this.documentId,
  ).capability;

  private readonly selecting = this.selection.select((selection) => selection.isSelecting(), false);
  private readonly visible = this.selection.select(
    (selection) => selection.isHighlightVisible(),
    true,
  );
  private readonly settings = this.selection.select(
    (selection) => selection.getSettings().handles,
    SELECTION_DEFAULTS.handles,
  );
  /** Both ends of the selection, compared corner by corner: the same until one moves. */
  private readonly endpoints = this.selection.select(
    (selection) => selectionHandleEndpointsOf(selection.getSnapshot()),
    null,
    sameSelectionEndpoints,
  );
  /** The handle being dragged: it keeps both handles shown while it selects. */
  private readonly dragging = signal<Role | null>(null);

  /** Each color is its CSS variable first, then the setting; an unset color is the accent. */
  protected readonly color = computed(() =>
    paint('text-selection-handle', this.settings().color ?? this.host.viewerSettings().accent),
  );
  protected readonly shadow = computed(() =>
    paint('text-selection-handle-shadow', this.settings().shadow),
  );

  /** Whether this sits over a Stage, the only surface with a camera to place handles through. */
  private readonly overStage = computed(() => this.projection?.projector()?.space === 'overlay');

  protected readonly handles = computed((): readonly HandleLayout[] => {
    const stage = this.stage();
    const endpoints = this.endpoints();
    if (!this.overStage() || !stage || !endpoints || !this.visible()) return NO_HANDLES;
    // Hidden while a drag selects text, like the menu; a handle's own drag keeps them.
    if (this.selecting() && !this.dragging()) return NO_HANDLES;
    // The camera: the handles move in the same pass as the pages.
    this.projection?.revision();
    const view = selectionHandleViewOf(stage);
    return (['start', 'end'] as const).flatMap((role) => {
      const layout = layoutOf(view, endpoints[role], role);
      return layout ? [layout] : [];
    });
  });

  protected readonly armStart = () => this.arm('start');
  protected readonly armEnd = () => this.arm('end');

  constructor() {
    if (!this.projection) warnOutsideStage();
    effect(() => {
      if (this.projection?.projector()?.space === 'client') warnOutsideStage();
    });
  }

  /** A press on a handle: start a drag from the other end, with the selection as it is now. */
  private arm(role: Role): SelectionGripDrag {
    const stage = untracked(this.stage);
    const endpoints = untracked(this.endpoints);
    const selection = untracked(this.selection.capability);
    if (!stage || !endpoints || !selection) return null;
    const armed = armSelectionHandle(selection, selectionHandleViewOf(stage), endpoints, role);
    if (!armed) return null;
    this.dragging.set(role);
    return {
      // The point the user grabbed: the middle of the bar.
      base: armed.base,
      session: {
        move: armed.drag.move,
        end: () => {
          armed.drag.end(); // settles: the menu comes back, and committed$ fires
          this.dragging.set(null);
        },
      },
    };
  }
}

/**
 * A handle laid out upright in its own box (the bar as long as the text is tall, the grip
 * above it at the start or below it at the end), then turned onto the text's edge about the
 * bar's top end: the one point that must sit exactly on the glyph's corner.
 */
function layoutOf(
  view: SelectionHandleView,
  endpoint: SelectionHandleEndpoint,
  role: Role,
): HandleLayout | null {
  const geometry = selectionHandleGeom(view, endpoint, role);
  if (!geometry) return null; // its page isn't laid out right now
  const barTop = HANDLE_PAD + (role === 'start' ? HANDLE_HEAD : 0);
  const pivotX = HANDLE_PAD + HANDLE_BAR / 2;
  return {
    role,
    left: geometry.bar.from.x - pivotX,
    top: geometry.bar.from.y - barTop,
    height: geometry.length + HANDLE_HEAD + 2 * HANDLE_PAD,
    barTop,
    barHeight: geometry.length,
    headTop: role === 'start' ? HANDLE_PAD : HANDLE_PAD + geometry.length,
    transform: geometry.upright ? null : `rotate(${geometry.rotation}deg)`,
    transformOrigin: geometry.upright ? null : `${pivotX}px ${barTop}px`,
  };
}

function warnOutsideStage(): void {
  devWarn(
    'selection-handles-outside-stage',
    '<epdf-selection-handles> draws nothing here: put it inside <epdf-stage> ' +
      '(an <epdf-page-view> has no camera to place the handles through).',
  );
}
