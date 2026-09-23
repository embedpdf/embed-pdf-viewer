import type { Mirror } from '@embedpdf/core';

import type { AnnotationConfig } from '../contract';
import { createAuthority, type Authority } from './authority';
import { createView, type View } from '../read/view';
import type { FontLookup } from '../rich-text';
import type { AnnotationContext } from './context';
import { createAnnotationEvents, type AnnotationEvents } from './events';
import { createFilePickerPort, type FilePickerPort } from './file-picker';
import { createCropLookup, type CropLookup } from './geometry';
import { createIntents } from './intents';
import { createNewRecords, type NewRecords } from './new-records';
import { createStore, type AnnotationStore } from './store';
import { createRecordsMirror, type AnnotationRecords } from '../sync/records';
import { createBehaviors, type Behaviors } from '../tools/behaviors';
import { createToolRegistry, type ToolRegistry } from '../tools/registry';

export type { AnnotationContext } from './context';

/**
 * The plugin-private helpers every area is built on. Created once by the
 * controller and handed to the areas, which declare the members they use.
 * Nothing here belongs to the kernel: these are annotation-specific
 * wrappers over `ctx`.
 */
export interface AnnotationServices {
  readonly events: AnnotationEvents;
  /** The confirmed layer: every record the engine confirmed. */
  readonly records: Mirror<AnnotationRecords>;
  /** Confirmed records with the pending changes on top, composed with the session. */
  readonly view: View;
  /** The one door user actions go through. */
  readonly store: AnnotationStore;
  readonly newRecords: NewRecords;
  readonly geometry: CropLookup;
  readonly authority: Authority;
  readonly filePicker: FilePickerPort;
  /** The registered fonts, for face ↔ key mapping (the local engine's list;
   *  the cloud engine registers none). */
  readonly fonts: FontLookup;
  readonly tools: ToolRegistry;
  readonly behaviors: Behaviors;
}

export function createServices(
  ctx: AnnotationContext,
  config: AnnotationConfig,
): AnnotationServices {
  const events = createAnnotationEvents(ctx);
  const geometry = createCropLookup(ctx);
  const records = createRecordsMirror(ctx, events);
  const view = createView(ctx, records, geometry);
  const refOf = (id: string) => view.model().byId[id]?.ref ?? null;
  const intents = createIntents(ctx, records, events, refOf);
  const store = createStore(ctx, view, intents, events);
  return {
    events,
    records,
    view,
    store,
    newRecords: createNewRecords(ctx, store, records),
    geometry,
    authority: createAuthority(ctx, store),
    filePicker: createFilePickerPort(ctx),
    fonts: () => ctx.engine?.fonts?.list() ?? [],
    tools: createToolRegistry(ctx, config, store),
    behaviors: createBehaviors(store),
  };
}
