/**
 * The annotation controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the host capability from the areas' API slices and nouns. No
 * behavior lives here: every verb and read has a home in `read/`, `write/`,
 * `sync/`, `comments/` or `tools/`. How the pieces fit is in README.md.
 */
import { composeApi } from '@embedpdf/core';

import { createComments } from './comments/comments';
import { createThreadIndex } from './comments/threads';
import { connectAnnotation } from './connect';
import type { AnnotationHostCapability } from './host-contract';
import { withSnap } from './model';
import { createAnnotationReads } from './read/annotations';
import { createChromeReads } from './read/chrome';
import { createPropertyReads } from './read/properties';
import { createRenderReads } from './read/render';
import { createServices, type AnnotationContext } from './services';
import { createAnnouncer } from './services/announce';
import { followConfirmedChanges } from './sync/confirmed';
import { createGhost } from './tools/ghost';
import { createCrud } from './write/crud';
import { createDrafts } from './write/drafts';
import { createIcons } from './write/icons';
import { createLinkWrites } from './write/links';
import { createMarkupWrites } from './write/markup';
import { createMeasurement } from './write/measurement';
import { registerOpBuilders } from './write/ops';
import { createPointer } from './write/pointer';
import { createScriptEffects } from './write/script-effects';
import { createSelectionWrites } from './write/selection';
import { createStamps } from './write/stamps';
import { createTextEditing } from './write/text-editing';

export function createAnnotationController(ctx: AnnotationContext) {
  const services = createServices(ctx);
  const { events, records, view, authority, tools, behaviors, settings } = services;

  // The session snaps as the settings say, and follows them when they change.
  ctx.state.update(withSnap, settings.get().snap);
  settings.api.onSettingsChanged(({ settings: next, changed }) => {
    if (changed.includes('snap')) ctx.state.update(withSnap, next.snap);
  });

  // Reads: pure projections of the model.
  const annotations = createAnnotationReads(ctx, services);
  const chrome = createChromeReads(ctx, services);
  const properties = createPropertyReads(ctx, services);

  // Sync: what follows when the engine confirms a change.
  followConfirmedChanges(ctx, services, createAnnouncer(events));

  // Writes: every change goes through the store, a gesture's through `commit`,
  // one stated in code through `apply`, and each is one change on the queue.
  const text = createTextEditing(ctx, services, chrome);
  // Before an export reads the document, send the words typed in the last
  // moment, and wait for every change on its way. (A download does the same
  // through the kernel's queue.)
  const settle = async (): Promise<void> => {
    await text.sendTyping();
    await services.store.whenWritten();
  };
  const links = createLinkWrites(ctx, services);
  registerOpBuilders(services);
  const crud = createCrud(ctx, services, annotations, settle);
  const stamps = createStamps(ctx, services);
  // The tool's ghost: what a click would make, which the page's items paint.
  const ghost = createGhost(ctx, services, stamps);
  const render = createRenderReads(ctx, services, ghost, stamps);
  const icons = createIcons(ctx, services, stamps);
  const selection = createSelectionWrites(ctx, services, annotations, properties, chrome, text);
  const measurement = createMeasurement(ctx, services, crud);
  const pointer = createPointer(ctx, services, chrome, measurement);
  const drafts = createDrafts(ctx, services, annotations);
  const markup = createMarkupWrites(ctx, services, annotations);
  const scripts = createScriptEffects(ctx, services);

  // Comments: the conversation lens over the same substrate.
  const threads = createThreadIndex(ctx, services);
  const comments = createComments(ctx, services, threads, crud);

  const api: AnnotationHostCapability = composeApi('annotation', [
    settings.api,
    annotations.api,
    chrome.api,
    render.api,
    tools.api,
    behaviors.api,
    text.api,
    links.api,
    crud.api,
    stamps.api,
    ghost.api,
    icons.api,
    measurement.api,
    pointer.api,
    drafts.api,
    markup.api,
    scripts.api,
    comments.api,
    {
      getAt: chrome.annotationAt,
      selection: selection.selection,
      draft: drafts.draft,
      text: {
        ...text.text,
        getEditing: annotations.getEditing,
        toggleFormat: selection.toggleFormat,
      },
      tools: tools.tools,
      stamps: stamps.stamps,
      // Authority twins, the records mirror and the events are services, not areas.
      getStatus: records.getStatus,
      refresh: (options?: { signal?: AbortSignal }) =>
        ctx.cancellable(options?.signal, records.refresh()),
      whenSynced: () => records.settled(),
      onResynced: events.resynced.on,
      canRead: authority.canRead,
      canCreate: authority.canCreate,
      canUpdate: authority.canUpdate,
      canDelete: authority.canDelete,
      onCreated: events.created.on,
      onUpdated: events.updated.on,
      onDeleted: events.deleted.on,
      onReordered: events.reordered.on,
      onSelectionChanged: events.selectionChanged.on,
      onDraftChanged: events.draftChanged.on,
      onEditingChanged: events.editingChanged.on,
      onHoverChanged: events.hoverChanged.on,
      onWriteFailed: events.writeFailed.on,
    },
  ]);
  return {
    api,
    connect: () => connectAnnotation(ctx, api),
    /** The composed model every read and gesture works on (for the plugin's tests). */
    model: view.model,
    /** The door for gestures and selection verbs (for the plugin's tests). */
    commit: services.store.commit,
    /** The door for changes stated in code (for the plugin's tests). */
    apply: services.store.apply,
  };
}
