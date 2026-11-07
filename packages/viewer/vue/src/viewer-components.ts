/**
 * The viewer's own components, for yours: `Button`, `Menu`, `MenuItem` and
 * `Icon` render the viewer's `<epdf-button>`, `<epdf-menu>`, `<epdf-menu-item>`
 * and `<epdf-icon>` elements, which the viewer draws like its own toolbar
 * buttons, menus and icons. Use them inside the viewer: in a `ToolbarItem`, a
 * `Panel` or a `Region`. The elements come with the viewer, so this module
 * imports nothing from it.
 */
import { defineComponent, h, type SlotsType, type VNode } from 'vue';

/**
 * The attributes that have a value. Vue sets an element's property where it has one, and the
 * elements' properties write `undefined` as the text "undefined".
 */
const given = (attributes: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(attributes).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export interface ButtonProps {
  /** Makes it this command's button: its icon, tooltip and state, and it runs it. */
  command?: string;
  /** An icon by name, the viewer's or yours, for a button of your own. */
  icon?: string;
  /** The name of a button of your own, for its tooltip and screen readers. */
  label?: string;
  /** Shown pressed, as a command's button is while its command is active. */
  active?: boolean;
}

/**
 * `active` as the elements read it: there or not. The prop is a `Boolean`, so `<Button active>`
 * is `true`; `null` takes the attribute away, set as the element's property or as the attribute.
 */
const activeOf = (active: boolean | undefined): true | null => (active ? true : null);

/** A toolbar button, the viewer's own. `@click` for a button of your own. */
export const Button = defineComponent<ButtonProps, { click: (event: MouseEvent) => true }>(
  (props, { emit }) =>
    () =>
      h('epdf-button', {
        ...given({ command: props.command, icon: props.icon, label: props.label }),
        active: activeOf(props.active),
        onClick: (event: MouseEvent) => emit('click', event),
      }),
  {
    name: 'Button',
    props: { command: String, icon: String, label: String, active: Boolean },
    emits: ['click'],
  },
);

export interface MenuProps {
  /** The icon of the button that opens it, by name. */
  icon?: string;
  /** Its name, for the button's tooltip and screen readers. */
  label: string;
}

/**
 * A button that opens a menu of `MenuItem`s, the way the viewer's menus open: away from its bar,
 * flipped when there's no room, and up from the bottom on a phone. Its rows go in its slot.
 */
export const Menu = defineComponent(
  (props: MenuProps, { slots }) =>
    () =>
      h('epdf-menu', given({ icon: props.icon, label: props.label }), slots.default?.()),
  {
    name: 'Menu',
    props: ['icon', 'label'],
    slots: Object as SlotsType<{ default?: () => VNode[] }>,
  },
);

export interface MenuItemProps {
  /** Makes it this command's row: its icon, label and state, and picking it runs it. */
  command?: string;
  /** An icon by name, the viewer's or yours. */
  icon?: string;
  /** Shown checked, as a command's row is while its command is active. */
  active?: boolean;
}

/** A row in a `Menu`, with its text in its slot. `@select` when the row is picked. */
export const MenuItem = defineComponent<
  MenuItemProps,
  { select: () => true },
  string,
  SlotsType<{ default?: () => VNode[] }>
>(
  (props, { emit, slots }) =>
    () =>
      h(
        'epdf-menu-item',
        // The element's own `select` event, which Vue listens to as it would a native one.
        {
          ...given({ command: props.command, icon: props.icon }),
          active: activeOf(props.active),
          onSelect: () => emit('select'),
        },
        slots.default?.(),
      ),
  {
    name: 'MenuItem',
    props: { command: String, icon: String, active: Boolean },
    emits: ['select'],
  },
);

export interface IconProps {
  /** The icon, by name: the viewer's or one of yours (`icons`). */
  name: string;
  /** Its width and height in px. Default `20`, a toolbar button's icon. */
  size?: number;
  /** What it shows, for screen readers; without one, they skip it. */
  label?: string;
}

/** One of the viewer's icons, or yours, in the color of the text around it. */
export const Icon = defineComponent(
  (props: IconProps) => () =>
    h('epdf-icon', {
      ...given({ name: props.name, label: props.label }),
      size: props.size ?? null,
    }),
  { name: 'Icon', props: { name: { type: String, required: true }, size: Number, label: String } },
);
