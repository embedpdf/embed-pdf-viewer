import type { Mirror, Settings } from '@embedpdf/core';
import type { FontLookup } from '@embedpdf/core-annotation';
import { isLocalEngine } from '@embedpdf/engine-core/runtime';

import type { AnnotationSettings } from '../contract';
import { createAuthority, type Authority } from './authority';
import { createView, type View } from '../read/view';
import type { AnnotationContext } from './context';
import { createAnnotationEvents, type AnnotationEvents } from './events';
import { createFilePickerPort, type FilePickerPort } from './file-picker';
import { createPageLookup, type PageLookup } from './geometry';
import { createStore, type AnnotationStore } from './store';
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
  /** The one door user actions go through. */
  readonly store: AnnotationStore;
  readonly geometry: PageLookup;
  readonly authority: Authority;
  readonly filePicker: FilePickerPort;
  /** The registered fonts, for face ↔ key mapping (the local engine's list;
   *  the cloud engine registers none). */
  readonly fonts: FontLookup;
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
  const view = createView(ctx, records);
  const store = createStore(ctx, view, records, events);
  // The tools a document has are read once, when it opens.
  const tools = createToolRegistry(ctx, settings.get().tools, store, events);
  return {
    settings,
    events,
    records,
    view,
    store,
    geometry,
    authority: createAuthority(ctx, store),
    filePicker: createFilePickerPort(ctx),
    fonts: () => (isLocalEngine(ctx.engine) ? ctx.engine.fonts.list() : []),
    tools,
    behaviors: createBehaviors(store),
    afterCreate: createAfterCreate(ctx, { settings, tools, store }),
  };
}
