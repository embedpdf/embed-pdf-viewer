/**
 * The viewer's own components, for your page: `<epdf-button>`, `<epdf-menu>`
 * and the `<epdf-menu-item>` rows inside a menu, and `<epdf-icon>`. Each sits
 * in your page inside an `<embedpdf-viewer>` (in a toolbar item, a panel or a
 * region), and the viewer draws it in the element's own shadow root, with the
 * viewer's own button, menu and icons, so it looks and works like the viewer's
 * (`placed-components.tsx` in the chrome). An element tells the viewer it's
 * there, and what its attributes and rows say whenever they change; a picked
 * row fires `select` on its `<epdf-menu-item>`.
 *
 * A button and a menu are the one keyboard stop of what they draw (`tabindex`,
 * focus handed to their button), so a toolbar's arrow keys reach them like the
 * bar's own buttons; an icon takes no focus. Defined once per page, and safe
 * to import on a server.
 */
import {
  createPlacedComponents,
  type PlacedComponent,
  type PlacedComponents,
  type PlacedMenuItem,
} from '@embedpdf/viewer-chrome';

import { chromeSheet, sheetOf } from './sheets';

/**
 * Where a viewer element keeps its components: a registered symbol, so the elements of one copy
 * of the viewer on a page and the viewer of another still meet.
 */
const PLACED = Symbol.for('@embedpdf/viewer/placed-components');

/** The viewer's own components placed inside the `<embedpdf-viewer>` element `viewer`. */
export function placedComponentsOf(viewer: Element): PlacedComponents {
  const holder = viewer as Element & { [PLACED]?: PlacedComponents };
  if (!holder[PLACED]) {
    Object.defineProperty(holder, PLACED, { value: createPlacedComponents() });
  }
  return holder[PLACED]!;
}

/** The `<embedpdf-viewer>` `element` is inside, through the shadow roots on the way. */
function viewerAround(element: Element): Element | null {
  for (let node: Node | null = element.parentNode; node; ) {
    if (node instanceof ShadowRoot) node = node.host;
    else if (node instanceof Element && node.localName === 'embedpdf-viewer') return node;
    else node = node.parentNode;
  }
  return null;
}

/** The box the element is in your page: in line, like a toolbar button; gone while `hidden`. */
const HOST_CSS = ':host{display:inline-flex;vertical-align:middle}:host([hidden]){display:none}';

let sheets: CSSStyleSheet[] | null = null;
const adoptedSheets = (): CSSStyleSheet[] => {
  sheets ??= [chromeSheet(), sheetOf(HOST_CSS)];
  return sheets;
};

/** Like the viewer element's base: `HTMLElement`, or a stand-in where there is no DOM. */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** An attribute's value, or null for none. */
const attributeOf = (element: Element, name: string): string | null => element.getAttribute(name);

/** Sets an attribute, or takes it away for null. */
function setAttributeOf(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/** Whether an element says `active`: the attribute is there, whatever its value. */
const isActive = (element: Element): boolean => element.hasAttribute('active');

/** Sets `active` as a boolean attribute: there for true, gone for false. */
const setActive = (element: Element, active: boolean): void => {
  element.toggleAttribute('active', Boolean(active));
};

/** An element the viewer draws: it says what it is to the viewer it's in, while it's in one. */
abstract class PlacedElement extends ElementBase {
  #viewer: Element | null = null;
  #root: ShadowRoot | null = null;

  /** What the viewer draws for this element, in `root`. */
  protected abstract describe(root: ShadowRoot): PlacedComponent;

  /** Whether what it draws takes focus: a button does, an icon doesn't. */
  protected get focusable(): boolean {
    return true;
  }

  connectedCallback(): void {
    if (!this.#root) {
      this.#root = this.attachShadow({ mode: 'open', delegatesFocus: this.focusable });
      this.#root.adoptedStyleSheets = adoptedSheets();
    }
    // The element is the stop of a toolbar's keys; the toolbar moves the tab stop between them.
    if (this.focusable && !this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.#viewer = viewerAround(this);
    this.changed();
  }

  disconnectedCallback(): void {
    if (this.#viewer) placedComponentsOf(this.#viewer).remove(this);
    this.#viewer = null;
  }

  attributeChangedCallback(): void {
    this.changed();
  }

  /** Tells the viewer what this element says now. */
  protected changed(): void {
    if (this.#viewer && this.#root)
      placedComponentsOf(this.#viewer).place(this.describe(this.#root));
  }
}

/**
 * `<epdf-button>`: a toolbar button. `command="zoom:in"` makes it that command, with its icon,
 * tooltip and state, and pressing it runs it; or give it an `icon` and a `label`, and handle its
 * `click`. `active` shows it pressed.
 */
export class EpdfButtonElement extends PlacedElement {
  static observedAttributes = ['command', 'icon', 'label', 'active'];

  /** The command it is, by id. */
  get command(): string | null {
    return attributeOf(this, 'command');
  }
  set command(command: string | null) {
    setAttributeOf(this, 'command', command);
  }

  /** Its icon, by name: the viewer's or one of yours. */
  get icon(): string | null {
    return attributeOf(this, 'icon');
  }
  set icon(icon: string | null) {
    setAttributeOf(this, 'icon', icon);
  }

  /** Its name, for its tooltip and screen readers. */
  get label(): string | null {
    return attributeOf(this, 'label');
  }
  set label(label: string | null) {
    setAttributeOf(this, 'label', label);
  }

  /** Shown pressed: the `active` attribute, there or not. */
  get active(): boolean {
    return isActive(this);
  }
  set active(active: boolean) {
    setActive(this, active);
  }

  protected describe(root: ShadowRoot): PlacedComponent {
    return {
      kind: 'button',
      host: this,
      root,
      command: this.command,
      icon: this.icon,
      label: this.label,
      active: this.active,
    };
  }
}

/**
 * `<epdf-menu-item>`: a row of an `<epdf-menu>`, its text the row's. `command="…"` makes it that
 * command's row; picking it runs the command, and fires `select` on this element either way.
 * `active` shows it checked.
 */
export class EpdfMenuItemElement extends ElementBase {
  /** The command it is, by id. */
  get command(): string | null {
    return attributeOf(this, 'command');
  }
  set command(command: string | null) {
    setAttributeOf(this, 'command', command);
  }

  /** Its icon, by name: the viewer's or one of yours. */
  get icon(): string | null {
    return attributeOf(this, 'icon');
  }
  set icon(icon: string | null) {
    setAttributeOf(this, 'icon', icon);
  }

  /** Shown checked: the `active` attribute, there or not. */
  get active(): boolean {
    return isActive(this);
  }
  set active(active: boolean) {
    setActive(this, active);
  }
}

/**
 * `<epdf-menu>`: a button that opens a menu of its `<epdf-menu-item>` rows, the way the viewer's
 * menus open: away from its bar, flipped when there's no room, and up from the bottom on a phone.
 */
export class EpdfMenuElement extends PlacedElement {
  static observedAttributes = ['icon', 'label'];

  #rows: MutationObserver | null = null;

  /** Its icon, by name: the viewer's or one of yours. */
  get icon(): string | null {
    return attributeOf(this, 'icon');
  }
  set icon(icon: string | null) {
    setAttributeOf(this, 'icon', icon);
  }

  /** Its name, for its tooltip and screen readers. */
  get label(): string | null {
    return attributeOf(this, 'label');
  }
  set label(label: string | null) {
    setAttributeOf(this, 'label', label);
  }

  connectedCallback(): void {
    // A row added, taken away, renamed or given another command changes the menu.
    this.#rows ??= new MutationObserver(() => this.changed());
    this.#rows.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['command', 'icon', 'active'],
    });
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this.#rows?.disconnect();
    super.disconnectedCallback();
  }

  protected describe(root: ShadowRoot): PlacedComponent {
    const items = [...this.children]
      .filter((child) => child.localName === 'epdf-menu-item')
      .map(
        (row): PlacedMenuItem => ({
          command: attributeOf(row, 'command'),
          icon: attributeOf(row, 'icon'),
          label: row.textContent?.trim() ?? '',
          active: isActive(row),
          select: () => row.dispatchEvent(new CustomEvent('select', { bubbles: true })),
        }),
      );
    return { kind: 'menu', host: this, root, icon: this.icon, label: this.label, items };
  }
}

/**
 * `<epdf-icon name="check">`: one of the viewer's icons, or one of the app's `icons`, `size` px
 * square (a toolbar button's, 20, unless it says), in the color of the text around it. With a
 * `label`, screen readers read it; without one, they skip it.
 */
export class EpdfIconElement extends PlacedElement {
  static observedAttributes = ['name', 'size', 'label'];

  protected get focusable(): boolean {
    return false;
  }

  /** The icon, by name: the viewer's or one of yours. */
  get name(): string | null {
    return attributeOf(this, 'name');
  }
  set name(name: string | null) {
    setAttributeOf(this, 'name', name);
  }

  /** Its width and height in px; null for a toolbar button's. */
  get size(): number | null {
    const size = Number.parseFloat(attributeOf(this, 'size') ?? '');
    return Number.isFinite(size) && size > 0 ? size : null;
  }
  set size(size: number | null) {
    setAttributeOf(this, 'size', size === null || size === undefined ? null : String(size));
  }

  /** What it shows, for screen readers; without one, they skip it. */
  get label(): string | null {
    return attributeOf(this, 'label');
  }
  set label(label: string | null) {
    setAttributeOf(this, 'label', label);
  }

  protected describe(root: ShadowRoot): PlacedComponent {
    return {
      kind: 'icon',
      host: this,
      root,
      icon: this.name,
      size: this.size,
      label: this.label,
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'epdf-button': EpdfButtonElement;
    'epdf-menu': EpdfMenuElement;
    'epdf-menu-item': EpdfMenuItemElement;
    'epdf-icon': EpdfIconElement;
  }
}

// Guarded like the viewer element: no registry outside a browser, and a second copy of the
// viewer on the page keeps the elements the first one defined.
if (typeof customElements !== 'undefined') {
  const elements = [
    ['epdf-button', EpdfButtonElement],
    ['epdf-menu', EpdfMenuElement],
    ['epdf-menu-item', EpdfMenuItemElement],
    ['epdf-icon', EpdfIconElement],
  ] as const;
  for (const [name, element] of elements) {
    if (!customElements.get(name)) customElements.define(name, element);
  }
}
