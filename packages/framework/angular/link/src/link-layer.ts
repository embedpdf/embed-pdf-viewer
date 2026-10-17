/**
 * `<epdf-link-layer>`: the links on one page, as real anchors. A website link gets an `href`
 * (so middle-click, "copy link" and the status bar work), every link can be reached with Tab
 * and followed with Enter, and a click or a key follows it through the plugin's `activate()`,
 * so every way of following a link fires `activated$`.
 *
 * The layer steps aside while the active tool doesn't navigate links (an annotation tool owns
 * them then); while a tool can edit annotations, a link that belongs to another annotation
 * steps aside too, so its parent can be selected and moved.
 *
 * Draw a link yourself with a template; `native` is the layer's own anchor, to wrap so a click
 * keeps doing what it does:
 *
 *   <epdf-link-layer>
 *     <ng-template epdfLink let-link let-native="native">
 *       <span class="pdf-link"><ng-container [ngTemplateOutlet]="native" /></span>
 *     </ng-template>
 *   </epdf-link-layer>
 *
 * With the actions plugin, the link's own actions run on enter, exit, press, release, focus
 * and blur. Which links are shown, each anchor's box, `href` and label, how a click is told
 * apart, and what a link sends the plugins are `@embedpdf/web`'s, shared by every framework.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  output,
  TemplateRef,
  untracked,
} from '@angular/core';
import type { CapabilityToken } from '@embedpdf/core';
import { StageToken, type StageCapability } from '@embedpdf/plugin-stage/contract';
import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import type { Link } from '@embedpdf/plugin-link';
import { LinkToken as LinkHostToken } from '@embedpdf/plugin-link/contract/host';
import {
  hoverLink,
  isModifiedClick,
  isolatePointerDown,
  linkActivateContextOf,
  linkAnchorOf,
  navigableLinksOf,
  sendLinkEvent,
  type LinkAnchor,
  type LinkAnchorEvent,
} from '@embedpdf/web';
import { CapabilityBinding, injectKernelHost, injectPage } from '@embedpdf/angular/runtime';
import { EpdfStage } from '@embedpdf/angular/stage';
import { registerWebsiteOpener } from './link';

/** What a link template gets: `let-link` is the link, `let-native="native"` the layer's anchor. */
export interface EpdfLinkTemplateContext {
  /** The link: its `id`, its `bounds` on the page and its `target`. */
  $implicit: Link;
  /** The layer's own anchor: `<ng-container [ngTemplateOutlet]="native" />`. */
  native: TemplateRef<unknown>;
}

/**
 * How each link is drawn instead of the layer's bare anchor:
 * `<ng-template epdfLink let-link let-native="native">`. For a link you don't want to change,
 * show `native` alone.
 */
@Directive({ selector: 'ng-template[epdfLink]' })
export class EpdfLinkTemplate {
  readonly template = inject<TemplateRef<EpdfLinkTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfLinkTemplate,
    context: unknown,
  ): context is EpdfLinkTemplateContext {
    return true;
  }
}

/**
 * A press on a link: kept from the Stage under it (which would start the active tool's gesture,
 * or end an edit as a click outside), and reported as `(epdfLinkPress)` for the link's own
 * "mouse down" action. One native listener does both.
 */
@Directive({ selector: '[epdfLinkPress]' })
export class EpdfLinkPress {
  readonly pressed = output<PointerEvent>({ alias: 'epdfLinkPress' });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    inject(DestroyRef).onDestroy(isolatePointerDown(element, (event) => this.pressed.emit(event)));
  }
}

const NO_LINKS: readonly Link[] = Object.freeze([]);

@Component({
  selector: 'epdf-link-layer',
  imports: [NgTemplateOutlet, EpdfLinkPress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length > 0) {
      <div style="position: absolute; inset: 0; pointer-events: none">
        @for (item of items(); track item.link.id) {
          <ng-template #native>
            <a
              target="_blank"
              rel="noopener noreferrer"
              role="link"
              tabindex="0"
              style="position: absolute; cursor: pointer; pointer-events: auto"
              [attr.href]="item.href"
              [attr.title]="item.label"
              [attr.aria-label]="item.label"
              [style.left.px]="item.box.left"
              [style.top.px]="item.box.top"
              [style.width.px]="item.box.width"
              [style.height.px]="item.box.height"
              (epdfLinkPress)="notify(item.link, 'mouseDown')"
              (click)="follow($event, item)"
              (keydown)="followByKey($event, item.link)"
              (pointerenter)="hover(item.link)"
              (pointerleave)="hover(null)"
              (pointerup)="notify(item.link, 'mouseUp')"
              (focus)="notify(item.link, 'focus')"
              (blur)="notify(item.link, 'blur')"
            ></a>
          </ng-template>
          <ng-container
            [ngTemplateOutlet]="custom()?.template ?? native"
            [ngTemplateOutletContext]="{ $implicit: item.link, native }"
          />
        }
      </div>
    }
  `,
})
export class EpdfLinkLayer {
  private readonly page = injectPage('<epdf-link-layer>');
  private readonly host = injectKernelHost('<epdf-link-layer>');
  private readonly enclosingStage = inject(EpdfStage, { optional: true });
  /** The app's own drawing of a link, when it gives one. */
  protected readonly custom = contentChild(EpdfLinkTemplate);

  /** A plugin of the page's own document: every plugin below is read for it. */
  private bindTo<Capability>(token: CapabilityToken<Capability>): CapabilityBinding<Capability> {
    return new CapabilityBinding(
      this.host,
      () => token,
      () => this.page.documentId,
    );
  }

  private readonly link = this.bindTo(LinkHostToken);
  /** Optional: with the actions plugin, a link's own actions run. */
  private readonly actions = this.bindTo(ActionsToken).capability;
  /** Optional: a tool that can edit annotations owns the links that belong to one. */
  private readonly editing = this.bindTo(InteractionHostToken).select(
    (interaction) => interaction.activeToolEnables('annotation-edit'),
    false,
  );
  /** A link to a page moves the view it was followed in: this Stage, or the main one. */
  private readonly stage = new CapabilityBinding<StageCapability>(
    this.host,
    () => this.enclosingStage?.token() ?? StageToken,
    () => this.page.documentId,
  ).capability;

  private readonly links = this.link.select((link) => link.listLinks(this.page.ref), NO_LINKS);
  /** Whether the active tool follows links: the layer draws nothing otherwise. */
  private readonly engaged = this.link.select((link) => link.isNavigationEngaged(), false);

  /** Each link's anchor: its box, its label, and a native `href` only for a website with nothing chained after it. */
  protected readonly items = computed((): readonly LinkAnchor<Link>[] => {
    const link = this.link.capability();
    if (!link || !this.engaged()) return [];
    const transform = this.page.transform();
    return navigableLinksOf(this.links(), this.editing()).map((item) =>
      linkAnchorOf(item, transform, (each) => link.getLabel(each)),
    );
  });

  /** One hover pump per layer: the enter and exit actions of the link under the pointer. */
  private readonly pump = computed(() => {
    const actions = this.actions();
    return actions ? createHoverPump(actions.dispatch) : null;
  });

  constructor() {
    registerWebsiteOpener(this.link.capability);
    // Read the page's links as soon as the page is shown.
    effect(() => {
      const link = this.link.capability();
      const page = this.page.ref;
      if (link) untracked(() => void link.ensureLoaded(page));
    });
  }

  protected follow(event: MouseEvent, item: LinkAnchor<Link>): void {
    // A click with a modifier on a real href stays the browser's: a background tab, a window.
    if (item.href && isModifiedClick(event)) return;
    // Every other click follows the link through the plugin, which opens a website through
    // this package's opener.
    event.preventDefault();
    this.activate(item.link);
  }

  protected followByKey(event: KeyboardEvent, link: Link): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.activate(link);
  }

  protected hover(link: Link | null): void {
    const pump = this.pump();
    if (!link) return pump?.hover(null);
    hoverLink(pump, link, this.page.ref);
  }

  /** Send one of the link's own events to the actions plugin, when the link has actions. */
  protected notify(link: Link, event: LinkAnchorEvent): void {
    sendLinkEvent(this.actions(), link, this.page.ref, event);
  }

  private activate(link: Link): void {
    const context = linkActivateContextOf(link, this.page.ref, this.stage());
    this.link.capability()?.activate(link, context);
  }
}
