/**
 * `<epdf-toolbar [bar]>`: a toolbar that measures what fits and makes room, and lets you draw
 * every part.
 *
 *   1. a hidden measurement layer draws every item in every variant (plus folded groups and the
 *      "More" button), each watched by `@embedpdf/web`'s `observeWidth`, so a new language, a
 *      font loading, browser zoom and your CSS all re-measure on their own; the widths become
 *      fit metrics (`createToolbarWidths`);
 *   2. core-ui's `solve()` gives each item a variant, a folded group or the "More" menu, and
 *      `layoutToolbar` turns that fit into the parts to draw;
 *   3. the live row draws them; the "More" menu is derived (`projectOverflow`) from what
 *      didn't fit.
 *
 * Every part is an `<ng-template>` you may give (`templates.ts`), with a plain default
 * (`defaults.ts`): the app owns the pixels, the toolbar owns the fitting. The items are
 * commands, read live, so a button follows its command's state with no code in the toolbar.
 */
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  DestroyRef,
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
  createToolbarWidths,
  observeContentWidth,
  observeWidth,
  toolbarMeasureKey,
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

/** Where the measured widths go: the toolbar the element is drawn in. */
interface ToolbarWidthSink {
  reportWidth(key: string, width: number): void;
}

const TOOLBAR_WIDTHS = new InjectionToken<ToolbarWidthSink>('TOOLBAR_WIDTHS');

/** Reports its element's border-box width to the toolbar, under its key, now and on resize. */
@Directive({ selector: '[epdfToolbarWidth]' })
export class EpdfToolbarWidth {
  readonly key = input.required<string>({ alias: 'epdfToolbarWidth' });

  constructor() {
    const element = inject<ElementRef<Element>>(ElementRef).nativeElement;
    const sink = inject(TOOLBAR_WIDTHS);
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      const key = this.key();
      onCleanup(observeWidth(element, (width) => sink.reportWidth(key, width)));
    });
  }
}

// ── the toolbar ──────────────────────────────────────────────────────────────

/**
 * A toolbar that fits itself to its width: items get smaller, groups fold, and what's left
 * over goes into a "More" menu, the least important first. `[gap]` (8) is the space between
 * items, `[separatorWidth]` (1) your separator's width; a `class` or `style` on the element
 * styles the toolbar itself. Draw the parts with the templates in `templates.ts`.
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
    EpdfToolbarWidth,
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
  providers: [{ provide: TOOLBAR_WIDTHS, useExisting: forwardRef(() => EpdfToolbar) }],
  host: { style: 'position: relative; display: flex; align-items: center;' },
  template: `
    <!--
      The sections: the center one has auto margins, so it stays centered in the space the
      others leave and gives way before anything overlaps. The sections never grow or shrink:
      what fits is the solver's decision, so the row's least width is exactly what it counted.
    -->
    <div [style]="sectionStyle" [style.gap.px]="gap()">
      @for (entry of row().start; track entry.key) {
        <ng-container *ngTemplateOutlet="drawn; context: { $implicit: entry }" />
      }
    </div>
    <div
      [style]="sectionStyle"
      [style.gap.px]="gap()"
      style="margin-left: auto; margin-right: auto"
    >
      @for (entry of row().center; track entry.key) {
        <ng-container *ngTemplateOutlet="drawn; context: { $implicit: entry }" />
      }
    </div>
    <div [style]="sectionStyle" [style.gap.px]="gap()">
      @for (entry of row().end; track entry.key) {
        <ng-container *ngTemplateOutlet="drawn; context: { $implicit: entry }" />
      }
      @if (hasOverflow()) {
        <span style="position: relative; display: inline-flex">
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
      button, hidden and observed. Text reflow (a language, fonts, zoom) re-measures by itself.
    -->
    <div aria-hidden="true" [style]="measureLayerStyle">
      @for (item of measured(); track item.key) {
        <span [epdfToolbarWidth]="item.key" style="display: inline-flex; flex-shrink: 0">
          <ng-container *ngTemplateOutlet="drawn; context: { $implicit: item.entry }" />
        </span>
      }
      <span [epdfToolbarWidth]="overflowTriggerKey" style="display: inline-flex; flex-shrink: 0">
        <ng-container
          *ngTemplateOutlet="
            overflowTriggerTemplate()?.template ?? defaultOverflowTrigger;
            context: closedTrigger
          "
        />
      </span>
    </div>

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
            [epdfToolbarWidth]="entry.key"
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
      <span style="width: 1px; align-self: stretch; background: currentColor; opacity: 0.2"></span>
    </ng-template>
    <ng-template epdfToolbarOverflowTrigger #defaultOverflowTrigger let-open let-toggle="toggle">
      <epdf-toolbar-more-button [open]="open" (toggle)="toggle()" />
    </ng-template>
    <ng-template epdfToolbarOverflowMenu #defaultOverflowMenu let-view>
      <epdf-toolbar-menu [view]="view" />
    </ng-template>
    <ng-template epdfToolbarCollapsed #defaultCollapsed let-view>
      <epdf-toolbar-collapsed [view]="view" />
    </ng-template>
    <ng-template epdfToolbarGroupTrigger #defaultGroupTrigger let-view>
      <epdf-toolbar-group-trigger [view]="view" />
    </ng-template>
  `,
})
export class EpdfToolbar implements ToolbarWidthSink {
  /** What the toolbar holds: `{ id, sections: { start, center, end } }` of groups and items. */
  readonly bar = input.required<BarSchema>();
  /** Pixels between neighbouring items; the solver counts the same number. */
  readonly gap = input(8);
  /** The width of the separator you draw. */
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

  private readonly widths = createToolbarWidths();
  /** Goes up whenever a measured width changed by more than half a pixel. */
  private readonly measureVersion = signal(0);
  private readonly containerWidth = signal(0);
  private readonly overflowOpen = signal(false);

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
        metrics: this.widths.metrics(this.gap(), this.separatorWidth()),
        measureKey: toolbarMeasureKey,
        containerWidth: this.containerWidth(),
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
  protected readonly sectionStyle = 'display: flex; align-items: center; flex: 0 0 auto;';
  protected readonly measureLayerStyle =
    'position: absolute; left: 0; top: 0; height: 0; overflow: hidden; visibility: hidden; ' +
    'pointer-events: none; display: flex; white-space: nowrap;';
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
    inject(DestroyRef).onDestroy(
      observeContentWidth(element, (width) => this.containerWidth.set(width)),
    );
  }

  /** A measured element's width; a change solves again. For the measurement layer. */
  reportWidth(key: string, width: number): void {
    if (this.widths.report(key, width)) this.measureVersion.update((version) => version + 1);
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
              measure: (width) => this.reportWidth(key, width),
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
