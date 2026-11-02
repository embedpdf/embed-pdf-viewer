import type { Mirror, Settings } from '@embedpdf/core';
import type { FontLookup, NamedFont } from '@embedpdf/core-annotation';
import { isLocalEngine, type FontList } from '@embedpdf/engine-core/runtime';
import { FontsToken } from '@embedpdf/plugin-fonts/contract';

import type { AnnotationSettings } from '../contract';
import { createAuthority, type Authority } from './authority';
import { createView, type View } from '../read/view';
import type { AnnotationContext } from './context';
import { createAnnotationEvents, type AnnotationEvents } from './events';
import { createFilePickerPort, type FilePickerPort } from './file-picker';
import { createPageLookup, type PageLookup } from './geometry';
import { createLending, type Lending } from './lending';
import { createStore, type AnnotationStore } from './store';
import { createTextFonts, type TextFonts } from '../read/text-fonts';
import { createRecordsMirror, type AnnotationRecords } from '../sync/records';
import { createBehaviors, type Behaviors } from '../tools/behaviors';
import { createToolRegistry, type ToolRegistry } from '../tools/registry';
import { createAfterCreate, type AfterCreate } from '../write/after-create';

export type { AnnotationContext } from './context';

/**
 * The plugin-private helpers every area is built on. Created once by the
 * controller and handed to the areas, which declare the members they use.
 * Nothing here belongs to the kernel: these are annotation-specific
 * wrappers over `ctx`.
 */
export interface AnnotationServices {
  /** The plugin's settings, shared by every document: read `get()` where a setting is used. */
  readonly settings: Settings<AnnotationSettings>;
  readonly events: AnnotationEvents;
  /** The records: what the engine confirmed (`get`), with this session's pending changes on top (`view`). */
  readonly records: Mirror<AnnotationRecords>;
  /** The records as shown, each drawn as its pending change says, composed with the session. */
  readonly view: View;
  /** A sibling's records shown and edited as annotations (the form plugin's widgets). */
  readonly lending: Lending;
  /** The one door user actions go through. */
  readonly store: AnnotationStore;
  readonly geometry: PageLookup;
  readonly authority: Authority;
  readonly filePicker: FilePickerPort;
  /** The fonts a box can name besides the standard ones, for name ↔ face
   *  mapping: the fonts plugin's list once it's loaded, else the local
   *  engine's registered fonts (the cloud engine registers none). */
  readonly fonts: FontLookup;
  /** The fonts the browser draws a box's text in. */
  readonly textFonts: TextFonts;
  readonly tools: ToolRegistry;
  readonly behaviors: Behaviors;
  /** What happens after a tool creates an annotation (`afterCreate`). */
  readonly afterCreate: AfterCreate;
}

export function createServices(ctx: AnnotationContext): AnnotationServices {
  const settings = ctx.settings();
  const events = createAnnotationEvents(ctx);
  const geometry = createPageLookup(ctx);
  const records = createRecordsMirror(ctx, events);
  const lending = createLending(() => ctx.notify());
  const view = createView(ctx, records, lending);
  const store = createStore(ctx, view, records, events, lending);
  // The tools a document has are read once, when it opens.
  const tools = createToolRegistry(ctx, settings.get().tools, store, events);
  const fonts = createFontLookup(ctx);
  return {
    settings,
    events,
    records,
    view,
    lending,
    store,
    geometry,
    authority: createAuthority(ctx, store),
    filePicker: createFilePickerPort(ctx),
    fonts,
    textFonts: createTextFonts(ctx, store, fonts),
    tools,
    behaviors: createBehaviors(store),
    afterCreate: createAfterCreate(ctx, { settings, tools, store }),
  };
}

/** The fonts a box can name: the fonts plugin's list, mapped once per list, else the registered ones. */
function createFontLookup(ctx: Pick<AnnotationContext, 'tryGet' | 'engine'>): FontLookup {
  let mapped: { list: FontList; fonts: NamedFont[] } | null = null;
  return () => {
    const list = ctx.tryGet(FontsToken)?.getFontList();
    if (!list) return isLocalEngine(ctx.engine) ? ctx.engine.fonts.list() : [];
    if (mapped?.list !== list) {
      const fonts = list.fonts
        .filter((font) => font.source !== 'standard')
        .map(({ name, familyName, weight, italic }) => ({ key: name, familyName, weight, italic }));
      mapped = { list, fonts };
    }
    return mapped.fonts;
  };
}
