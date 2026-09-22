/**
 * The annotation controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the host capability from the areas' API slices. No behavior
 * lives here: every verb and read has a home in `read/`, `write/`, `sync/`,
 * `comments/` or `tools/`.
 */
import { composeApi } from '@embedpdf/core';
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
import { connectAnnotation } from './connect';
import { createRecordsMirror } from './sync/records';
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

export function createAnnotationController(ctx: AnnotationContext, config: AnnotationConfig = {}) {
  const services = createServices(ctx, config);
  const { events, authority, tools, behaviors } = services;

  // Reads: pure projections of the model.
  const annotations = createAnnotationReads(services);
  const chrome = createChromeReads(ctx, services);
  const render = createRenderReads(ctx, services);
  const selectionProps = createSelectionPropsReads(ctx, services);
  const announce = createAnnouncer(events, annotations.projectRef);

  // Sync: the engine's confirmed records into the model.
  const confirmedRecords = createRecordsMirror(ctx, services, announce);

  // Writes: every durable change, through the store's one commit door.
  const text = createTextEditing(ctx, services, annotations, chrome);
  const links = createLinkWrites(ctx, services);
  const crud = createCrud(ctx, services, annotations, text, links);
  const stamps = createStamps(ctx, services);
  const ghost = createGhost(ctx, services, stamps);
  const icons = createIcons(ctx, services, stamps);
  const selection = createSelectionWrites(services, annotations, selectionProps, text, links, crud);
  const measurement = createMeasurement(ctx, services, crud, confirmedRecords);
  const pointer = createPointer(ctx, services, chrome, measurement);
  const drafts = createDrafts(ctx, services);
  const markup = createMarkupWrites(ctx, services);
  const scripts = createScriptEffects(ctx, services);
  const settings = createSettings(ctx, services);

  // Comments: the conversation lens over the same substrate.
  const threads = createThreadIndex(ctx, services);
  const comments = createComments(ctx, services, threads, crud);

  const api: AnnotationHostCapability = composeApi('annotation', [
    annotations.api,
    chrome.api,
    render.api,
    selectionProps.api,
    tools.api,
    behaviors.api,
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
    {
      // Authority twins, the records mirror and the events are services, not areas.
      getStatus: confirmedRecords.getStatus,
      refresh: () => confirmedRecords.refresh(),
      whenSynced: () => confirmedRecords.settled(),
      onResynced: events.resynced.on,
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
    },
  ]);
  return { api, connect: () => connectAnnotation(ctx, api, services) };
}
