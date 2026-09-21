/**
 * The annotation controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the host capability from the areas' API slices. No behavior
 * lives here — every verb and read has a home in `read/`, `write/`,
 * `sync/`, `comments/` or `tools/`.
 */
import { createComments } from './comments/comments';
import { createThreadIndex } from './comments/threads';
import type { AnnotationConfig } from './contract';
import type { AnnotationHostCapability } from './host-contract';
import { createAnnotationReads } from './read/annotations';
import { createChromeReads } from './read/chrome';
import { createRenderReads } from './read/render';
import { createSelectionPropsReads } from './read/selection-props';
import { createServices, type AnnotationContext } from './services';
import { createAnnouncer } from './services/announce';
import { createHydration } from './sync/hydration';
import { createRemoteSync } from './sync/remote';
import { createCrud } from './write/crud';
import { createDrafts } from './write/drafts';
import { createGhost } from './write/ghost';
import { createIcons } from './write/icons';
import { createLinkWrites } from './write/links';
import { createMarkupWrites } from './write/markup';
import { createMeasurement } from './write/measurement';
import { createPointer } from './write/pointer';
import { createScriptEffects } from './write/script-effects';
import { createSelectionWrites } from './write/selection';
import { createSettings } from './write/settings';
import { createStamps } from './write/stamps';
import { createTextEditing } from './write/text-editing';

/** Every API member is defined by exactly one area — a duplicate is a wiring bug. */
function assertDisjoint(slices: readonly object[]): void {
  const seen = new Set<string>();
  for (const slice of slices) {
    for (const key of Object.keys(slice)) {
      if (seen.has(key)) throw new Error(`[annotation] api member '${key}' is defined twice`);
      seen.add(key);
    }
  }
}

export function createAnnotationController(
  ctx: AnnotationContext,
  config: AnnotationConfig = {},
): AnnotationHostCapability {
  const services = createServices(ctx, config);
  const { events, authority, tools, behaviors } = services;

  // Reads: pure projections of the model.
  const annotations = createAnnotationReads(services);
  const chrome = createChromeReads(ctx, services);
  const render = createRenderReads(ctx, services);
  const selectionProps = createSelectionPropsReads(ctx, services);
  const announce = createAnnouncer(events, annotations.projectRef);

  // Sync: the engine's records into the model.
  const remote = createRemoteSync(services, announce);
  const hydration = createHydration(ctx, services, remote);

  // Writes: every durable change, through the store's one commit door.
  const text = createTextEditing(ctx, services, annotations, chrome);
  const links = createLinkWrites(ctx, services);
  const crud = createCrud(ctx, services, annotations, announce, text, links);
  const stamps = createStamps(ctx, services);
  const ghost = createGhost(ctx, services, stamps);
  const icons = createIcons(ctx, services, announce, stamps);
  const selection = createSelectionWrites(services, annotations, selectionProps, text, links, crud);
  const measurement = createMeasurement(ctx, services, crud, hydration);
  const pointer = createPointer(ctx, services, chrome, measurement);
  const drafts = createDrafts(ctx, services);
  const markup = createMarkupWrites(ctx, services);
  const scripts = createScriptEffects(ctx, services, hydration);
  const settings = createSettings(ctx, services);

  // Comments: the conversation lens over the same substrate.
  const threads = createThreadIndex(ctx, services);
  const comments = createComments(ctx, services, threads, crud);

  const slices = [
    annotations.api,
    chrome.api,
    render.api,
    selectionProps.api,
    tools.api,
    behaviors.api,
    hydration.api,
    text.api,
    links.api,
    crud.api,
    stamps.api,
    ghost.api,
    icons.api,
    selection.api,
    measurement.api,
    pointer.api,
    drafts.api,
    markup.api,
    scripts.api,
    settings.api,
    comments.api,
  ] as const;
  assertDisjoint(slices);

  const api = {
    ...annotations.api,
    ...chrome.api,
    ...render.api,
    ...selectionProps.api,
    ...tools.api,
    ...behaviors.api,
    ...hydration.api,
    ...text.api,
    ...links.api,
    ...crud.api,
    ...stamps.api,
    ...ghost.api,
    ...icons.api,
    ...selection.api,
    ...measurement.api,
    ...pointer.api,
    ...drafts.api,
    ...markup.api,
    ...scripts.api,
    ...settings.api,
    ...comments.api,
    // Authority twins and the confirmed-change events are services, not areas.
    canRead: authority.canRead,
    canCreate: authority.canCreate,
    canEdit: authority.canEdit,
    canDelete: authority.canDelete,
    onCreated: events.created.on,
    onUpdated: events.updated.on,
    onDeleted: events.deleted.on,
    onSelectionChanged: events.selectionChanged.on,
    onDraftChanged: events.draftChanged.on,
    onEditingChanged: events.editingChanged.on,
  } satisfies AnnotationHostCapability;
  return api;
}
