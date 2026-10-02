/**
 * The parts of `<epdf-toolbar>` you draw, each an `<ng-template>` inside its tags, typed so
 * `let-` gives what the part needs:
 *
 *   <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
 *   <ng-template epdfToolbarCustom="page-number" let-variant>
 *   <ng-template epdfToolbarCollapsed let-view>          a folded group
 *   <ng-template epdfToolbarGroupTrigger let-view>       the button behind which a group sheds items
 *   <ng-template epdfToolbarSeparator>                   the line between groups
 *   <ng-template epdfToolbarOverflowTrigger let-open let-toggle="toggle">   the "More" button
 *   <ng-template epdfToolbarOverflowMenu let-view>       the "More" menu
 *
 * A part you leave out has a plain default. The names carry `Toolbar` because `epdfCommand`
 * is the directive for a button of your own.
 */
import { Directive, inject, input, TemplateRef } from '@angular/core';
import type {
  CollapsedGroupView as CollapsedGroupViewOf,
  GroupDisclosureView as GroupDisclosureViewOf,
  OverflowMenuView as OverflowMenuViewOf,
} from '@embedpdf/core-ui';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';

// ── what each part gets ─────────────────────────────────────────────────────

/** A command's button: `let-command`, `let-variant="variant"`, `let-run="run"`. */
export interface EpdfToolbarCommandContext {
  /** The command, read live: label, icon, `enabled`, `active`. */
  $implicit: ResolvedCommand;
  /** The variant the toolbar chose for it, such as `'icon+label'` or `'icon'`. */
  variant: string;
  /** Run the command for the toolbar's document. */
  run: () => void;
}

/** An item of your own: `let-variant`, and `let-layer="layer"`, `let-measure="measure"`. */
export interface EpdfToolbarCustomContext {
  /** The variant the toolbar chose for it, one of the item's `variants`. */
  $implicit: string;
  /** `'live'` in the toolbar, `'measure'` in the hidden layer that measures every variant. */
  layer: 'live' | 'measure';
  /**
   * Report the item's width yourself, for content the hidden layer can't draw. The toolbar
   * measures what the template draws without it.
   */
  measure: (width: number) => void;
}

/**
 * A group in its folded form (a menu button, or a `<select>`, as the group's `collapse` says):
 * its visible commands, read live, and how to run one.
 */
export type CollapsedGroupView = CollapsedGroupViewOf<ResolvedCommand>;

/**
 * The button behind which a group keeps the items it shed. `commands` are the shed items in
 * bar order. The hidden layer measures it with the whole group behind it, so a trigger that
 * shows a count is measured at its widest.
 */
export type GroupDisclosureView = GroupDisclosureViewOf<ResolvedCommand>;

/** The "More" menu: what didn't fit, in sections, and the calls a menu needs. */
export type OverflowMenuView = OverflowMenuViewOf<ResolvedCommand>;

/** A part that gets one view: `let-view`. */
export interface EpdfToolbarViewContext<View> {
  $implicit: View;
}

/** The "More" button: `let-open` (whether the menu is open) and `let-toggle="toggle"`. */
export interface EpdfToolbarOverflowTriggerContext {
  $implicit: boolean;
  toggle: () => void;
}

// ── the marker directives ───────────────────────────────────────────────────

/** A command's button. Without it: a plain `<button>` with the command's label. */
@Directive({ selector: 'ng-template[epdfToolbarCommand]' })
export class EpdfToolbarCommandTemplate {
  readonly template = inject<TemplateRef<EpdfToolbarCommandContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfToolbarCommandTemplate,
    context: unknown,
  ): context is EpdfToolbarCommandContext {
    return true;
  }
}

/**
 * An item of your own, by the name `custom(name, command)` gave it in the bar. Without one, the
 * item is a `<slot name>`: inside a shadow root your element's children of that `slot` go
 * there; elsewhere it shows its command's button.
 */
@Directive({ selector: 'ng-template[epdfToolbarCustom]' })
export class EpdfToolbarCustomTemplate {
  /** The item's name in the bar. */
  readonly slot = input.required<string>({ alias: 'epdfToolbarCustom' });
  readonly template = inject<TemplateRef<EpdfToolbarCustomContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfToolbarCustomTemplate,
    context: unknown,
  ): context is EpdfToolbarCustomContext {
    return true;
  }
}

/** A folded group. Without it: a `<select>` for `collapse: 'select'`, a menu button for `'menu'`. */
@Directive({ selector: 'ng-template[epdfToolbarCollapsed]' })
export class EpdfToolbarCollapsedTemplate {
  readonly template = inject<TemplateRef<EpdfToolbarViewContext<CollapsedGroupView>>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfToolbarCollapsedTemplate,
    context: unknown,
  ): context is EpdfToolbarViewContext<CollapsedGroupView> {
    return true;
  }
}

/**
 * The button of a group that sheds items, and its menu: the template keeps its own open state.
 * Without it: a chevron opening a menu of the shed items.
 */
@Directive({ selector: 'ng-template[epdfToolbarGroupTrigger]' })
export class EpdfToolbarGroupTriggerTemplate {
  readonly template = inject<TemplateRef<EpdfToolbarViewContext<GroupDisclosureView>>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfToolbarGroupTriggerTemplate,
    context: unknown,
  ): context is EpdfToolbarViewContext<GroupDisclosureView> {
    return true;
  }
}

/**
 * The line between two groups. Without it: a 1px line. Tell the toolbar its width with
 * `[separatorWidth]` when yours is wider.
 */
@Directive({ selector: 'ng-template[epdfToolbarSeparator]' })
export class EpdfToolbarSeparatorTemplate {
  readonly template = inject<TemplateRef<void>>(TemplateRef);
}

/** The "More" button. Without it: a plain ⋯ button. */
@Directive({ selector: 'ng-template[epdfToolbarOverflowTrigger]' })
export class EpdfToolbarOverflowTriggerTemplate {
  readonly template = inject<TemplateRef<EpdfToolbarOverflowTriggerContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfToolbarOverflowTriggerTemplate,
    context: unknown,
  ): context is EpdfToolbarOverflowTriggerContext {
    return true;
  }
}

/** The "More" menu, drawn under its button. Without it: a plain popover. */
@Directive({ selector: 'ng-template[epdfToolbarOverflowMenu]' })
export class EpdfToolbarOverflowMenuTemplate {
  readonly template = inject<TemplateRef<EpdfToolbarViewContext<OverflowMenuView>>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfToolbarOverflowMenuTemplate,
    context: unknown,
  ): context is EpdfToolbarViewContext<OverflowMenuView> {
    return true;
  }
}
