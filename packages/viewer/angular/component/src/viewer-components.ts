/**
 * The viewer's own components, for yours: `EpdfButton`, `EpdfMenu` and `EpdfMenuItem` let your
 * templates use the viewer's `<epdf-button>`, `<epdf-menu>` and `<epdf-menu-item>` elements,
 * which the viewer draws like its own toolbar buttons and menus, in their own shadow roots. Use
 * them inside the viewer: in a toolbar item, a panel or a region.
 *
 * Each is a directive on the element itself: it tells Angular's template checker the element and
 * its inputs, and hands the inputs on as the attributes the element reads. It draws nothing, so
 * the element draws itself. The elements come with the viewer, so this module imports nothing
 * from it.
 */
import { Directive, input } from '@angular/core';

/**
 * `<epdf-button>`: a toolbar button, the viewer's own. `command="zoom:in"` makes it that
 * command's button, with its icon, tooltip and state, and pressing it runs it; or give it an
 * `icon` and a `label`, and handle its `(click)`.
 */
@Directive({
  selector: 'epdf-button',
  host: {
    '[attr.command]': 'command() ?? null',
    '[attr.icon]': 'icon() ?? null',
    '[attr.label]': 'label() ?? null',
  },
})
export class EpdfButton {
  /** Makes it this command's button: its icon, tooltip and state, and it runs it. */
  readonly command = input<string>();
  /** An icon by name, the viewer's or yours, for a button of your own. */
  readonly icon = input<string>();
  /** The name of a button of your own, for its tooltip and screen readers. */
  readonly label = input<string>();
}

/**
 * `<epdf-menu>`: a button that opens a menu of its `<epdf-menu-item>` rows, the way the viewer's
 * menus open: away from its bar, flipped when there's no room, and up from the bottom on a phone.
 */
@Directive({
  selector: 'epdf-menu',
  host: {
    '[attr.icon]': 'icon() ?? null',
    '[attr.label]': 'label()',
  },
})
export class EpdfMenu {
  /** The icon of the button that opens it, by name. */
  readonly icon = input<string>();
  /** Its name, for the button's tooltip and screen readers. */
  readonly label = input.required<string>();
}

/**
 * `<epdf-menu-item>`: a row of an `<epdf-menu>`, its text the row's. `command="…"` makes it that
 * command's row, and picking it runs the command. The element fires `(select)` when the row is
 * picked, either way.
 */
@Directive({
  selector: 'epdf-menu-item',
  host: {
    '[attr.command]': 'command() ?? null',
    '[attr.icon]': 'icon() ?? null',
  },
})
export class EpdfMenuItem {
  /** Makes it this command's row: its icon, label and state, and picking it runs it. */
  readonly command = input<string>();
  /** An icon by name, the viewer's or yours. */
  readonly icon = input<string>();
}
