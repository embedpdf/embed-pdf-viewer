/**
 * The stamp controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. Every verb and read
 * has a home in `read/` or `write/`; the one state-change event is derived
 * here.
 */
import { composeApi } from '@embedpdf/core';

import type { StampCapability } from './contract';
import { createCatalog } from './read/catalog';
import { createServices, type StampContext } from './services';
import { createAssetWrites } from './write/assets';
import { createLibraryWrites } from './write/libraries';
import { createMarks } from './write/marks';
import { createPlacement } from './write/placement';

export function createStampController(ctx: StampContext) {
  const services = createServices(ctx);
  const { events } = services;
  const settings = ctx.settings();

  // What is armed on a document is state: the event follows it, whichever
  // verb, tool switch or closed document changed it.
  ctx.state.onChange(({ previous, next }) => {
    if (previous.armed === next.armed) return;
    const documentIds = new Set([...Object.keys(previous.armed), ...Object.keys(next.armed)]);
    for (const documentId of documentIds) {
      const assetId = next.armed[documentId];
      if (previous.armed[documentId] === assetId) continue;
      events.armChanged.emit({
        documentId,
        asset: assetId === undefined ? null : (next.assets[assetId] ?? null),
      });
    }
  });

  // Reads: pure projections of the state and the binaries resource.
  const catalog = createCatalog(ctx, services);

  // Writes: every durable change, through the per-library mutation queue.
  const marks = createMarks(services);
  const libraries = createLibraryWrites(ctx, services);
  const assets = createAssetWrites(ctx, services, marks, libraries, catalog);
  const placement = createPlacement(ctx, services, catalog);

  const api: StampCapability = composeApi('stamp', [
    settings.api,
    catalog.api,
    libraries.api,
    assets.api,
    placement.api,
    {
      // The events are services, not areas.
      onLibraryChanged: events.libraryChanged.on,
      onLibraryCreated: events.libraryCreated.on,
      onLibraryUpdated: events.libraryUpdated.on,
      onLibraryDeleted: events.libraryDeleted.on,
      onAssetCreated: events.assetCreated.on,
      onAssetUpdated: events.assetUpdated.on,
      onAssetDeleted: events.assetDeleted.on,
      onArmChanged: events.armChanged.on,
    },
  ]);
  return { api };
}
