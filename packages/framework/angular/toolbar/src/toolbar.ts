/**
 * `<epdf-toolbar [bar]>`: a toolbar that measures what fits and makes room, and lets you draw
 * every part.
 *
 *   1. a hidden measurement layer draws every item in every variant (plus folded groups and the
 *      "More" button), each watched by `@embedpdf/web`'s `observeLength` along the toolbar
 *      (widths, or heights when it is vertical), so a new language, a font loading, browser zoom
 *      and your CSS all re-measure on their own; the lengths become fit metrics
 *      (`createToolbarLengths`);
 *   2. core-ui's `solve()` gives each item a variant, a folded group or the "More" menu, and
 *      `layoutToolbar` turns that fit into the parts to draw;
 *   3. the live row draws them; the "More" menu is derived (`projectOverflow`) from what
 *      didn't fit.
 *
 * The toolbar is one tab stop with arrow keys along it (`attachToolbarFocus`), and its default
 * menus take the menu keys (`attachMenuKeys`). Every part is an `<ng-template>` you may give
 * (`templates.ts`), with a plain default (`defaults.ts`): the app owns the pixels, the toolbar
 * owns the fitting and the keyboard. The items are commands, read live, so a button follows its
 * command's state with no code in the toolbar.
 */
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  Directive,
  effect,
  ElementRef,
  forwardRef,
  inject,
  InjectionToken,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  type Signal,
  type TemplateRef,
} from '@angular/core';
import {
  CapabilityBinding,
  injectDocumentScope,
  injectKernelHost,
} from '@embedpdf/angular/runtime';
import { EpdfCommands } from '@embedpdf/angular/commands';
import { layoutToolbar, normalizeBar } from '@embedpdf/core-ui';
import type { BarSchema, LiveSection, ToolbarLayout, ToolbarPart } from '@embedpdf/core-ui';
import { unregisteredCommand, type ResolvedCommand } from '@embedpdf/plugin-commands/contract';
// The "More" menu asks which menu a command opens, a host fact, so the host lens is bound here.
import { CommandsToken as CommandsHostToken } from '@embedpdf/plugin-commands/contract/host';
import {
  attachToolbarFocus,
  createToolbarLengths,
  observeContentLength,
  observeLength,
  toolbarMeasureKey,
  type Orientation,
  type RovingFocus,
} from '@embedpdf/web';
import {
  EpdfToolbarCollapsed,
  EpdfToolbarGroupTrigger,
  EpdfToolbarMenu,
  EpdfToolbarMoreButton,
  TOOLBAR_PAINT,
} from './defaults';
import {
  EpdfToolbarCollapsedTemplate,
  EpdfToolbarCommandTemplate,
  EpdfToolbarCustomTemplate,
  EpdfToolbarGroupTriggerTemplate,
  EpdfToolbarOverflowMenuTemplate,
  EpdfToolbarOverflowTriggerTemplate,
  EpdfToolbarSeparatorTemplate,
  type CollapsedGroupView,
  type EpdfToolbarCommandContext,
  type EpdfToolbarCustomContext,
  type EpdfToolbarOverflowTriggerContext,
  type EpdfToolbarViewContext,
  type GroupDisclosureView,
  type OverflowMenuView,
} from './templates';

// ── what the row and the measurement layer draw ─────────────────────────────

/**
 * One thing in a section of the row, or in the measurement layer: a part of core-ui's
 * `layoutToolbar` with its template's context, or a separator. `key` is the key the part is
 * measured under, unique across the toolbar.
 */
type Entry =
  | { readonly kind: 'command'; readonly key: string; readonly context: EpdfToolbarCommandContext }
  | {
      readonly kind: 'custom';
      readonly key: string;
      readonly template: TemplateRef<EpdfToolbarCustomContext>;
      readonly context: EpdfToolbarCustomContext;
    }
  | {
      // An item of your own with no template: a `<slot>`, measured where it renders.
      readonly kind: 'socket';
      readonly key: string;
      readonly slot: string;
      readonly context: EpdfToolbarCommandContext | null;
    }
  | {
      readonly kind: 'collapsed';
      readonly key: string;
      readonly context: EpdfToolbarViewContext<CollapsedGroupView>;
    }
  | {
      readonly kind: 'trigger';
      readonly key: string;
      readonly context: EpdfToolbarViewContext<GroupDisclosureView>;
    }
  | { readonly kind: 'separator'; readonly key: string };

/** The live row, per section. */
interface Row {
  readonly start: readonly Entry[];
  readonly center: readonly Entry[];
  readonly end: readonly Entry[];
}

/** What the toolbar draws while there is no commands plugin: nothing. */
const EMPTY_LAYOUT: ToolbarLayout<ResolvedCommand> = {
  sections: [
    { name: 'start', groups: [] },
    { name: 'center', groups: [] },
    { name: 'end', groups: [] },
  ],
  measured: [],
  hasOverflow: false,
  overflow: [],
};
const noop = () => {};

// ── measuring ────────────────────────────────────────────────────────────────

/** Where the measured lengths go: the toolbar the element is drawn in. */
interface ToolbarLengthSink {
  /** Which way the toolbar runs: what its elements measure along. */
  readonly orientation: Signal<Orientation>;
  reportLength(key: string, length: number): void;
}

const TOOLBAR_LENGTHS = new InjectionToken<ToolbarLengthSink>('TOOLBAR_LENGTHS');

/** Whether `element` draws anything: an element, or some text, among its children. */
const drawsSomething = (element: Element): boolean =>
  [...element.childNodes].some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE ||
      (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())),
  );

/**
 * Reports its element's border-box length along the toolbar (its width, or its height in a
 * vertical one) to the toolbar, under its key, now and on resize. With `ifDrawn`, only while the
 * element draws something: an item of your own whose template draws nothing in the measurement
 * layer reports its length itself, with `measure`, from where it renders.
 */
@Directive({ selector: '[epdfToolbarLength]' })
export class EpdfToolbarLength {
  readonly key = input.required<string>({ alias: 'epdfToolbarLength' });
  readonly ifDrawn = input(false);

  constructor() {
    const element = inject<ElementRef<Element>>(ElementRef).nativeElement;
    const sink = inject(TOOLBAR_LENGTHS);
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      const key = this.key();
      const orientation = sink.orientation();
      onCleanup(
        untracked(() =>
          observeLength(element, orientation, (length) => {
            if (this.ifDrawn() && !drawsSomething(element)) return;
            sink.reportLength(key, length);
          }),
        ),
      );
    });
  }
}

// ── the toolbar ──────────────────────────────────────────────────────────────

/**
 * A toolbar that fits itself to its width, or its height with `orientation="vertical"`: items
 * get smaller, groups fold, and what's left over goes into a "More" menu, the least important
 * first. `[gap]` (8) is the space between items, `[separatorWidth]` (1) your
 * separator's thickness; the element is the toolbar (`role="toolbar"`), so a `class`, `style`
 * or `aria-label` on it is the toolbar's. It is one tab stop, with arrow keys between its
 * items. Draw the parts with the templates in `templates.ts`.
 *
 *   <epdf-toolbar [bar]="bar">
 *     <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
 *       <button (click)="run()" [disabled]="!command.enabled">{{ command.label }}</button>
 *     </ng-template>
 *   </epdf-toolbar>
 */
@Component({
  selector: 'epdf-toolbar',
  imports: [
    NgTemplateOutlet,
    EpdfToolbarLength,
    EpdfToolbarMoreButton,
    EpdfToolbarMenu,
    EpdfToolbarCollapsed,
    EpdfToolbarGroupTrigger,
    EpdfToolbarCommandTemplate,
    EpdfToolbarCollapsedTemplate,
    EpdfToolbarGroupTriggerTemplate,
    EpdfToolbarOverflowTriggerTemplate,
    EpdfToolbarOverflowMenuTemplate,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: TOOLBAR_LENGTHS, useExisting: forwardRef(() => EpdfToolbar) }],
  host: {
    role: 'toolbar',
    '[attr.aria-orientation]': 'orientation()',
    style: 'position: relative; display: flex; align-items: center;',
    '[style.flex-direction]': "orientation() === 'vertical' ? 'column' : 'row'",
  },
  template: `
    <!--
      The sections run along the toolbar: the center one has auto margins, so it stays centered
      in the space the others leave and gives way before anything overlaps. The sections never
      grow or shrink: what fits is the solver's decision, so the row's least length is exactly
      what it counted.
    -->
    <div [style]="sectionStyle()" [style.gap.px]="gap()">
      @for (entry of row().start; track entry.key) {
        <ng-container *ngTemplateOutlet="liveEntry; context: { $implicit: entry }" />
      }
    </div>
    <div [style]="centerStyle()" [style.gap.px]="gap()">
      @for (entry of row().center; track entry.key) {
        <ng-container *ngTemplateOutlet="liveEntry; context: { $implicit: entry }" />
      }
    </div>
    <div [style]="sectionStyle()" [style.gap.px]="gap()">
      @for (entry of row().end; track entry.key) {
        <ng-container *ngTemplateOutlet="liveEntry; context: { $implicit: entry }" />
      }
      @if (hasOverflow()) {
        <span data-epdf-toolbar-item style="position: relative; display: inline-flex">
          <ng-container
            *ngTemplateOutlet="
              overflowTriggerTemplate()?.template ?? defaultOverflowTrigger;
              context: overflowTrigger()
            "
          />
          <ng-container
            *ngTemplateOutlet="
              overflowMenuTemplate()?.template ?? defaultOverflowMenu;
              context: overflowMenu()
            "
          />
        </span>
      }
    </div>

    <!--
      The measurement layer: every item in every variant, every folded group and the "More"
      button, hidden, inert and observed. Text reflow (a language, fonts, zoom) re-measures by
      itself. An item of your own whose template draws nothing here is measured where it renders.
    -->
    <div aria-hidden="true" inert [style]="measureLayerStyle()">
      @for (item of measured(); track item.key) {
        <span
          [epdfToolbarLength]="item.key"
          [ifDrawn]="item.entry.kind === 'custom'"
          style="display: inline-flex; flex-shrink: 0"
        >
          <ng-container *ngTemplateOutlet="drawn; context: { $implicit: item.entry }" />
        </span>
      }
      <span [epdfToolbarLength]="overflowTriggerKey" style="display: inline-flex; flex-shrink: 0">
        <ng-container
          *ngTemplateOutlet="
            overflowTriggerTemplate()?.template ?? defaultOverflowTrigger;
            context: closedTrigger
          "
        />
      </span>
    </div>

    <!--
      An item of the live row, in the element that marks it (TOOLBAR_ITEM_ATTRIBUTE in
      @embedpdf/web): its first element that takes focus is the item's stop in the arrow-key
      order. The element adds no box, so the item lays out as the section's own child.
    -->
    <ng-template #liveEntry let-entry>
      @if (entry.kind === 'separator') {
        <ng-container *ngTemplateOutlet="drawn; context: { $implicit: entry }" />
      } @else {
        <span data-epdf-toolbar-item style="display: contents">
          <ng-container *ngTemplateOutlet="drawn; context: { $implicit: entry }" />
        </span>
      }
    </ng-template>

    <ng-template #drawn let-entry>
      @switch (entry.kind) {
        @case ('command') {
          <ng-container
            *ngTemplateOutlet="
              commandTemplate()?.template ?? defaultCommand;
              context: entry.context
            "
          />
        }
        @case ('custom') {
          <ng-container *ngTemplateOutlet="entry.template; context: entry.context" />
        }
        @case ('socket') {
          <!-- Inside a shadow root, the host's children for this slot are drawn here. -->
          <slot
            [attr.name]="entry.slot"
            [epdfToolbarLength]="entry.key"
            style="display: inline-flex; align-items: center; flex-shrink: 0"
          >
            @if (entry.context) {
              <ng-container
                *ngTemplateOutlet="
                  commandTemplate()?.template ?? defaultCommand;
                  context: entry.context
                "
              />
            }
          </slot>
        }
        @case ('collapsed') {
          <ng-container
            *ngTemplateOutlet="
              collapsedTemplate()?.template ?? defaultCollapsed;
              context: entry.context
            "
          />
        }
        @case ('trigger') {
          <ng-container
            *ngTemplateOutlet="
              groupTriggerTemplate()?.template ?? defaultGroupTrigger;
              context: entry.context
            "
          />
        }
        @case ('separator') {
          <ng-container *ngTemplateOutlet="separatorTemplate()?.template ?? defaultSeparator" />
        }
      }
    </ng-template>

    <!-- The defaults: plain, and meant to be replaced. -->
    <ng-template epdfToolbarCommand #defaultCommand let-command let-run="run">
      <button
        type="button"
        [disabled]="!command.enabled"
        [attr.aria-pressed]="command.active || null"
        [attr.aria-haspopup]="command.menu ? 'menu' : null"
        [title]="command.label"
        [style]="commandStyle"
        [style.background]="command.active ? paint.active : 'transparent'"
        [style.cursor]="command.enabled ? 'pointer' : 'default'"
        [style.opacity]="command.enabled ? 1 : 0.4"
        (click)="run()"
      >
        <!-- Icons are the app's: the plain button shows the label in every variant. -->
        {{ command.label }}
      </button>
    </ng-template>
    <ng-template #defaultSeparator>
      <span [style]="separatorStyle()"></span>
    </ng-template>
    <ng-template epdfToolbarOverflowTrigger #defaultOverflowTrigger let-open let-toggle="toggle">
      <epdf-toolbar-more-button [open]="open" (toggle)="toggle()" />
    </ng-template>
    <ng-template epdfToolbarOverflowMenu #defaultOverflowMenu let-view>
      <epdf-toolbar-menu [view]="view" [orientation]="orientation()" />
    </ng-template>
    <ng-template epdfToolbarCollapsed #defaultCollapsed let-view>
      <epdf-toolbar-collapsed [view]="view" [orientation]="orientation()" />
    </ng-template>
    <ng-template epdfToolbarGroupTrigger #defaultGroupTrigger let-view>
      <epdf-toolbar-group-trigger [view]="view" [orientation]="orientation()" />
    </ng-template>
  `,
})
export class EpdfToolbar implements ToolbarLengthSink {
  /** What the toolbar holds: `{ id, sections: { start, center, end } }` of groups and items. */
  readonly bar = input.required<BarSchema>();
  /**
   * Which way the toolbar runs. A vertical toolbar fits the height it's given, so give it one;
   * it stacks its sections top, middle and bottom, and draws every command at `'icon'`, with
   * the label for a tooltip.
   */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  /** Pixels between neighbouring items; the solver counts the same number. */
  readonly gap = input(8);
  /**
   * The thickness of the separator you draw: its width across a horizontal toolbar, its height
   * in a vertical one.
   */
  readonly separatorWidth = input(1);

  // ── the app's templates ─────────────────────────────────────────────────────

  protected readonly commandTemplate = contentChild(EpdfToolbarCommandTemplate);
  private readonly customTemplates = contentChildren(EpdfToolbarCustomTemplate);
  protected readonly collapsedTemplate = contentChild(EpdfToolbarCollapsedTemplate);
  protected readonly groupTriggerTemplate = contentChild(EpdfToolbarGroupTriggerTemplate);
  protected readonly separatorTemplate = contentChild(EpdfToolbarSeparatorTemplate);
  protected readonly overflowTriggerTemplate = contentChild(EpdfToolbarOverflowTriggerTemplate);
  protected readonly overflowMenuTemplate = contentChild(EpdfToolbarOverflowMenuTemplate);

  // ── the commands ────────────────────────────────────────────────────────────

  private readonly host = injectKernelHost('<epdf-toolbar>');
  // Names withCommands() in the error when the viewer has no commands plugin, and runs them.
  private readonly commands = inject(EpdfCommands);
  /** The host lens, for this part of the template's document: resolves and finds menus. */
  private readonly registry = new CapabilityBinding(
    this.host,
    () => CommandsHostToken,
    injectDocumentScope(),
  ).capability;

  private readonly lengths = createToolbarLengths();
  /** Goes up whenever a measured length changed by more than half a pixel. */
  private readonly measureVersion = signal(0);
  /** The room along the toolbar: its width, or its height when vertical. */
  private readonly containerLength = signal(0);
  private readonly overflowOpen = signal(false);
  /** The arrow keys along the toolbar, while it's in the page. */
  private roving: RovingFocus | null = null;
  private readonly vertical = computed(() => this.orientation() === 'vertical');

  private readonly normalized = computed(() => normalizeBar(this.bar()));

  /**
   * What to draw: the bar with what's visible now, fitted and turned into parts. A command's
   * state is derived when it's read, so this reads again after every change of the viewer; the
   * toolbar is small, and a read of every item per change is the simple, correct baseline.
   */
  private readonly layout = this.host.read(
    (): ToolbarLayout<ResolvedCommand> => {
      this.measureVersion();
      const registry = this.registry();
      if (!registry) return EMPTY_LAYOUT;
      return layoutToolbar({
        bar: this.normalized(),
        resolve: (id) => registry.resolveCommand(id),
        unregistered: unregisteredCommand,
        execute: (id) => this.execute(id),
        menuTarget: (id) => registry.getMenuTarget(id),
        metrics: this.lengths.metrics(this.orientation(), this.gap(), this.separatorWidth()),
        measureKey: toolbarMeasureKey,
        containerLength: this.containerLength(),
        orientation: this.orientation(),
      });
    },
    () => EMPTY_LAYOUT,
  );
  protected readonly hasOverflow = computed(() => this.layout().hasOverflow);

  protected readonly row = computed((): Row => {
    const [start, center, end] = this.layout().sections;
    return {
      start: this.liveEntries(start),
      center: this.liveEntries(center),
      end: this.liveEntries(end),
    };
  });

  /** Every item in every variant, each folded group and each shed group's button. */
  protected readonly measured = computed(() =>
    this.layout().measured.flatMap((part) => {
      const entry = this.entryOf(part, 'measure');
      return entry ? [{ key: part.measureKey, entry }] : [];
    }),
  );

  protected readonly overflowTrigger = computed(
    (): EpdfToolbarOverflowTriggerContext => ({
      $implicit: this.overflowOpen(),
      toggle: () => this.overflowOpen.update((open) => !open),
    }),
  );
  protected readonly closedTrigger: EpdfToolbarOverflowTriggerContext = {
    $implicit: false,
    toggle: noop,
  };

  protected readonly overflowMenu = computed((): EpdfToolbarViewContext<OverflowMenuView> => {
    return {
      $implicit: {
        sections: this.layout().overflow,
        isOpen: this.overflowOpen(),
        close: () => this.overflowOpen.set(false),
        resolve: (id) => this.resolve(id),
        execute: (id) => this.execute(id),
      },
    };
  });

  protected readonly overflowTriggerKey = toolbarMeasureKey.overflowTrigger;
  protected readonly paint = TOOLBAR_PAINT;
  protected readonly sectionStyle = computed(
    () =>
      `display: flex; flex-direction: ${this.vertical() ? 'column' : 'row'}; ` +
      'align-items: center; flex: 0 0 auto;',
  );
  protected readonly centerStyle = computed(
    () =>
      this.sectionStyle() +
      (this.vertical()
        ? ' margin-top: auto; margin-bottom: auto;'
        : ' margin-left: auto; margin-right: auto;'),
  );
  /** A 1px line across the toolbar: upright in a horizontal one, flat in a vertical one. */
  protected readonly separatorStyle = computed(
    () =>
      `${this.vertical() ? 'height' : 'width'}: 1px; align-self: stretch; ` +
      'background: currentColor; opacity: 0.2;',
  );
  /**
   * A row for a horizontal toolbar, a column for a vertical one, and no height either way, so it
   * never adds to the page. A column keeps each item at its own width, so no text wraps and
   * changes the heights it reports.
   */
  protected readonly measureLayerStyle = computed(
    () =>
      'position: absolute; left: 0; top: 0; height: 0; overflow: hidden; visibility: hidden; ' +
      'pointer-events: none; display: flex; white-space: nowrap;' +
      (this.vertical() ? ' flex-direction: column; align-items: flex-start;' : ''),
  );
  protected readonly commandStyle =
    'display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; ' +
    `white-space: nowrap; color: inherit; font: inherit; border: 1px solid ${TOOLBAR_PAINT.border}; ` +
    'border-radius: 4px;';

  constructor() {
    // The "More" menu closes when everything fits again.
    effect(() => {
      if (!this.hasOverflow()) untracked(() => this.overflowOpen.set(false));
    });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // The room the toolbar fills, along the way it runs.
    effect((onCleanup) => {
      const orientation = this.orientation();
      onCleanup(
        untracked(() =>
          observeContentLength(element, orientation, (length) => this.containerLength.set(length)),
        ),
      );
    });
    // The keyboard: one tab stop, and arrow keys along the toolbar.
    afterRenderEffect((onCleanup) => {
      const orientation = this.orientation();
      const focus = untracked(() => attachToolbarFocus(element, orientation));
      this.roving = focus;
      onCleanup(() => {
        focus.detach();
        this.roving = null;
      });
    });
    // Any draw can add, remove or disable an item, so the tab stop is checked after each one.
    afterRenderEffect(() => {
      this.row();
      this.hasOverflow();
      this.overflowOpen();
      untracked(() => this.roving?.refresh());
    });
  }

  /** A measured element's length along the toolbar; a change solves again. */
  reportLength(key: string, length: number): void {
    if (this.lengths.report(untracked(this.orientation), key, length)) {
      this.measureVersion.update((version) => version + 1);
    }
  }

  // ── building the entries ────────────────────────────────────────────────────

  private resolve(id: string): ResolvedCommand | null {
    return untracked(this.registry)?.resolveCommand(id) ?? null;
  }

  private execute(id: string): void {
    // A command whose `run` throws reports it through the commands' `executionFailed$`.
    this.commands.execute(id).catch(noop);
  }

  private customTemplateFor(slot: string): EpdfToolbarCustomTemplate | undefined {
    return this.customTemplates().find((template) => template.slot() === slot);
  }

  /** A section's groups, with a separator before every group but the first. */
  private liveEntries(section: LiveSection<ResolvedCommand> | undefined): Entry[] {
    const entries: Entry[] = [];
    section?.groups.forEach((group, index) => {
      if (index > 0) entries.push({ kind: 'separator', key: `separator:${group.id}` });
      for (const part of group.parts) {
        const entry = this.entryOf(part, 'live');
        if (entry) entries.push(entry);
      }
    });
    return entries;
  }

  /** A part with its template's context; null for an item of your own with no template, when measuring. */
  private entryOf(part: ToolbarPart<ResolvedCommand>, layer: 'live' | 'measure'): Entry | null {
    const key = part.measureKey;
    switch (part.kind) {
      case 'command':
        return {
          kind: 'command',
          key,
          context: { $implicit: part.command, variant: part.variant, run: part.run },
        };
      case 'custom': {
        const custom = this.customTemplateFor(part.name);
        if (custom) {
          return {
            kind: 'custom',
            key,
            template: custom.template,
            context: {
              $implicit: part.variant,
              layer,
              measure: (length) => this.reportLength(key, length),
            },
          };
        }
        // An item of your own with no template is measured where it renders: only the first
        // `<slot>` of a name gets the projected content, so it can't be drawn here too.
        if (layer === 'measure') return null;
        return {
          kind: 'socket',
          key,
          slot: part.name,
          context: part.terminal && {
            $implicit: part.terminal,
            variant: 'icon',
            run: part.runTerminal,
          },
        };
      }
      case 'collapsed':
        return { kind: 'collapsed', key, context: { $implicit: part.view } };
      case 'disclosure':
        return { kind: 'trigger', key, context: { $implicit: part.view } };
    }
  }
}
