# @embedpdf/viewer-chrome

The full viewer, as one React component. This package is the **single
implementation** of the snippet UI — the measured toolbar, mode bands, panels,
tab bar, theme — consumed by `@embedpdf/viewer` (the Preact-compiled
`<embedpdf-viewer>` custom element) and every framework wrapper. It is private:
apps install a delivery package, not the chrome.

The customization surface below is **the** contract: the same object shape
later powers `EmbedPDF.init({ ... })` and every wrapper's props, because all of
it is plain data — nothing here is React-specific except the component itself.

## Quickstart

```tsx
import { FullViewer } from '@embedpdf/viewer-chrome';
import '@embedpdf/viewer-chrome/styles.css';
import { localEngine } from '@embedpdf/engine';

<FullViewer
  engine={() => localEngine()}
  initialDocuments={[{ name: 'Report', source: reportBytes }]}
/>;
```

Everything renders at t≈0; only the pages wait on the wasm engine.

## Customizing

Two kinds of surface, two deliberate semantics:

- **Registries** (`commands`, `icons`, `strings`) are **additive**: your
  entries merge over the defaults by id; a colliding id overrides. Safe,
  order-independent, upgrade-friendly.
- **Structure** (`chrome`) is a **value you own**: take the default, transform
  it, or write your own. It is never merged — there is no patch grammar to
  learn, because the schema is small enough to read.

### Remove features

```tsx
<FullViewer engine={engine} disabledCategories={['form', 'redaction']} />
```

A disabled category vanishes everywhere at once — toolbar, menus, overflow,
shortcuts — because every surface is a projection of the same command registry.

### Add a button

The 90% case, end to end — one command, one icon, one string, one placement:

```tsx
<FullViewer
  engine={engine}
  icons={{
    // 24×24 stroke path data — Tabler/Lucide icons paste in verbatim.
    send: [
      'M10 14L21 3',
      'M21 3l-6.5 18a.5.5 0 0 1-1 0L10 14l-7-3.5a.5.5 0 0 1 0-1L21 3z',
    ],
  }}
  strings={{
    en: { 'acme.send': 'Send for signature' },
    nl: { 'acme.send': 'Verstuur ter ondertekening' },
  }}
  commands={[
    {
      id: 'acme:send',
      labelKey: 'acme.send',
      icon: 'send',
      shortcut: 'Mod+Shift+S',
      enabled: (ctx) => ctx.documentId !== null,
      run: (ctx) => {
        void fetch(`/api/sign/${ctx.documentId}`, { method: 'POST' });
      },
    },
  ]}
  chrome={(base, h) =>
    h.addItem(base, {
      bar: 'main',
      section: 'end',
      group: 'panels',
      item: 'acme:send',
    })
  }
/>
```

That one registration is a button that degrades responsively (`importance` is
the only responsive knob — there are no breakpoints to edit), drops into the
derived overflow menu on narrow screens, has a working keyboard shortcut, and
is localized. Referencing an unknown command or icon logs a dev-mode warning
naming the exact id.

`chrome` accepts the schema **value** or a **transform** of the default. The
helpers come in as the second argument so simple edits need no imports:

```tsx
chrome={(base, h) =>
  h.removeItems(
    h.replaceItem(base, 'panel:comment', { command: 'acme:chat', importance: 5 }),
    ['annotation:add-squiggly'],
  )
}
```

- `h.addItem(schema, { bar, section, group, item, at? })` — `bar` is a bar id
  (`'main'`, a mode bar like `'annotate'`, or a strip); a new `group` id
  creates that group at the end of the section.
- `h.removeItems(schema, ids)` — purges the commands from every bar, mode bar,
  strip, and menu; emptied groups disappear.
- `h.replaceItem(schema, id, item)` — swaps a command in place, everywhere.
- Plus the authoring sugar (`h.item`, `h.group`, `h.custom`, `h.defineChrome`)
  for building bigger pieces inline.

### Own the structure

For real restructuring, don't patch — write the value. It is the complete
structural definition of the viewer, and it is small:

```tsx
import {
  FullViewer,
  defineChrome,
  group,
  custom,
  defaultChrome,
} from '@embedpdf/viewer-chrome';

// A minimal "reading room": zoom, search, download. Nothing else.
const chrome = defineChrome({
  bars: {
    main: {
      id: 'main',
      sections: {
        start: [
          group('zoom', [
            custom('zoom-controls', {
              variants: ['inline', 'button'],
              terminal: 'zoom:menu',
            }),
          ]),
        ],
        end: [group('actions', ['panel:search', 'document:download'])],
      },
    },
  },
  menus: { zoom: defaultChrome.menus.zoom },
});

<FullViewer engine={engine} chrome={chrome} />;
```

Adding an entry under `chrome.modeBars` adds a whole mode: the mode tab strip
is derived from `modeBars` keys, so a custom review workflow is one command
(the mode surface) plus one bar schema — not a special case.

Your stability, your choice: pass no `chrome` and you track our default (new
features appear on upgrade); own the value and your toolbar never moves — new
EmbedPDF features arrive as new command ids you opt into by adding a line.

### Locale

```tsx
<FullViewer engine={engine} locale="es" />        // fixed
<FullViewer engine={engine} locale="auto" />      // negotiate from the browser (default)
```

`strings` may target any locale code, with dotted keys (`'acme.send'`)
expanding into the pack. A code with no built-in pack becomes a new locale that
falls back to English for everything you didn't provide.

## What's deliberately NOT here (yet)

- **Slots** (your component inside the measured toolbar) — land with the
  `<embedpdf-viewer>` element: a slot is a light-DOM child with a `slot`
  attribute; this package only reserves and measures the box.
- **Theme prop** — the `--ep-*` token set in `styles.css` is the styling
  contract; a `theme` config object maps onto it when the element lands.
