# The viewer chrome

`@embedpdf/viewer-chrome` (`packages/viewer/chrome`) is the viewer's interface,
written once, as one React component: the toolbars that measure themselves, the
mode tabs, the panels, the document tabs and the theme. `@embedpdf/viewer`
compiles it with Preact into the `<embedpdf-viewer>` element
([`viewer-doors.md`](./viewer-doors.md)), and every framework wrapper wraps that
element. Apps install one of those, not the chrome.

This file is the law for what the chrome takes from an app, and how that grows.
What an app writes is in the viewer docs (`docs/content/viewer/`), which are the
spec:

| What an app does                           | The page under `docs/content/viewer/`  |
| :----------------------------------------- | :------------------------------------- |
| Turns features on and off, `readOnly`      | `features/turning-off`                 |
| Adds commands, icons, a button of its own  | `customize/commands`                   |
| Changes the layout: bars, menus, panels    | `customize/layout`, `customize/panels` |
| Puts its own components in, fills a region | `customize/components`                 |
| Sets the language and the words            | `customize/translations`               |
| Sets colors and restyles parts             | `customize/theming`                    |
| Drives the viewer from code                | `code/viewer`, `code/plugins`          |

## The contract is plain data

What customizes the viewer is one object, the same for `init()`, the element's
`config` and every wrapper's props (`ViewerCustomization`, which
`packages/viewer/main/src/kernel/config.ts` shares as it is). All of it is plain
data and functions of plain data. Nothing in it is React's but the component
that reads it, `FullViewer` (`src/viewer.tsx`).

It has two kinds of surface, with a rule each:

- **Registries are additive**: `commands`, `icons` and `strings`. An app's
  entries merge over the defaults by id, and one with a default's id replaces
  it. The order doesn't matter, and an upgrade adds entries without touching the
  app's.
- **Structure is a value the app owns**: `layout`. It is never merged. The app
  takes the default and edits it with the layout's own methods, each of which
  returns a new layout, or it writes the whole value. A `layout` that is a
  function of the default follows the default, so a new feature appears on
  upgrade. A value the app wrote never moves, and a new feature is a new id the
  app adds.

## Every surface shows the same commands

The toolbars, the menus, the overflow menu and the keyboard shortcuts all show
and run the commands of one registry. So what `features` or `readOnly` turns
off is gone from all of them at once, and a command an app adds is a button
that shrinks with the bar, moves into the overflow menu on a narrow screen, has
its shortcut and is translated.

- **`importance` is the only setting for narrow screens.** There are no
  breakpoints to edit.
- **`features` and `readOnly` are only the interface.** The plugins keep working
  for an app's code, and `scope` is what the engine enforces.
- **A mistake is named.** A layout that names an id the viewer doesn't have
  logs a warning with the id and the closest one that exists
  (`src/layout-root.tsx`), and a command that names an unknown icon logs a
  warning with its name. The element checks both in every build
  (`viewer-doors.md`, "The delivery build").

## Sockets: an app's component in the layout

`{ custom, command }` in a layout makes a socket. Through the element or a
wrapper, an app gives it a child with the slot `item:<id>` (in React, a
`<ToolbarItem id>`).

- **The child stays in the page**: light DOM, the app's own framework tree and
  CSS. The browser shows it in the toolbar.
- **The socket is measured as it is shown**, so the toolbar fits the child at
  its real width. When it no longer fits, its `command` stands for it in the
  overflow menu; without a `command`, it never leaves the bar.
- **An unfilled socket shows its command**, as the slot's fallback, so one
  layout works with and without the child, and outside a shadow root too:
  someone who renders `FullViewer` directly sees the fallback.
- **An id is used once in a layout**: one `<slot name>` per shadow tree wins.
- **The child is told where it sits**, with `data-orientation`, `data-edge`,
  `data-variant` and `data-size` (`src/ui/item-context.ts`), and the viewer's
  own elements inside it (`<epdf-button>`, `<epdf-menu>`, `<epdf-icon>`) are
  drawn like the viewer's.

## Regions

The regions are a fixed list: `header`, `footer`, `tabs`, `empty`, and the bars.
Each carries something the chrome owns: how it is measured, the document gate,
its ARIA. A region can be arranged or hidden, which is part of the layout, and
replaced, since a region is a socket whose fallback is the built-in.

- **`header` has no built-in.** The viewer ships no brand row, language picker
  or theme switch: those belong to the app. Theme and language are config, so a
  switch in the app's own header is a state change on its side.
- **A replacement works through the `viewer`.** A tab bar of the app's own
  reads `viewer.documents` (`list()`, `getActiveId()`, `setActive()`,
  `close()`) and follows it with `viewer.watch`.
- **Hidden wins over filled.** A region the layout hides (`tabs('never')`) hides
  its socket too.
- **The mode bars ride the main toolbar**, on the side of the pages: below a
  top bar, above a bottom one.

## The `viewer`

The `viewer` (`element.viewer`, or what `onReady` gives) is a thin layer over
the kernel (`src/handle.ts`). `get(name)` or `get(Token)` returns a plugin's
capability as it is, the same one the chrome's own buttons use. `documents` and
`commands` are two of them, and `watch` is the one way to follow a value.

- **Buttons speak commands, code speaks capabilities.**
- **The public API is two lists**: the plugin names `get()` takes
  (`VIEWER_PLUGINS`), and the tokens `src/index.ts` exports again. A plugin's
  host lens (its `/contract/host` entry) is in no delivery bundle.
- **A `viewer` lives as long as the viewer it reaches.** `createViewer` returns
  it with its lifetime. Once that ends, the listeners made through it are
  removed, a read throws `instance-closed`, every other call returns a promise
  that rejects with it, and a new subscription does nothing.
- **The element's events** (`epdf:ready`, `epdf:documentchange`) are a
  convenience over `watch`.

## Theme and parts

- **The tokens** are `THEME_TOKENS` (`src/ui/theme.tsx`), each the CSS variable
  `--epdf-<name>`. `src/styles.css` declares them on the viewer's root with a
  default for each mode, and mixes every other shade the chrome draws with from
  them in its `@theme inline` block, so the Tailwind classes (`bg-surface`,
  `text-fg`, `border-border-subtle`, `rounded-md`) follow them.
- **`accent` and the two page tokens are read by the pages too**, so they theme
  the pages and the chrome together.
- **The page wins.** A variable the page sets on the element, or around it, wins
  over the config and the defaults: the sheet reads the page's value on the host
  first.
- **The element puts the config's tokens in its shadow root** (`themeTokenCss`).
  Someone who renders `FullViewer` directly sets the variables in their own CSS.
- **The part names** (`embedpdf-viewer::part(toolbar-button)`) are public API.
  A new one is added when an app needs it, and stays.

## What the chrome leaves out

- **Swapping an element.** There is no registry that lets an app name the tag a
  button or a menu is drawn with.
- **More regions and parts than the lists above.** Each name is public API, so
  one is added when an app needs it.
