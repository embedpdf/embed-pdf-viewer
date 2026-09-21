import type { AnnotationConfig } from '../contract';
import type { FontLookup } from '../rich-text';
import { createAuthority, type Authority } from './authority';
import type { AnnotationContext } from './context';
import { createAnnotationEvents, type AnnotationEvents } from './events';
import { createFilePickerPort, type FilePickerPort } from './file-picker';
import { createPageGeometry, type PageGeometry } from './geometry';
import { createRecords, type Records } from './records';
import { createStore, type AnnotationStore } from './store';
import { createWriteSink, type WriteSink } from './write-sink';
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
  readonly store: AnnotationStore;
  readonly geometry: PageGeometry;
  readonly authority: Authority;
  readonly records: Records;
  readonly writes: WriteSink;
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
  const store = createStore(ctx, events);
  const geometry = createPageGeometry(ctx);
  return {
    events,
    store,
    geometry,
    authority: createAuthority(ctx, store),
    records: createRecords(ctx, store, geometry),
    writes: createWriteSink(),
    filePicker: createFilePickerPort(ctx),
    fonts: () => ctx.engine?.fonts?.list() ?? [],
    tools: createToolRegistry(ctx, config, store),
    behaviors: createBehaviors(store),
  };
}
