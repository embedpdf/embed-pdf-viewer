/**
 * The stamp controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here — every verb and read has a home in `read/` or `write/`.
 */
import { composeApi } from '@embedpdf/core';
import type { StampConfig } from './contract';
import type { StampHostCapability } from './host-contract';
import { createCatalog } from './read/catalog';
import { createServices, type StampContext } from './services';
import { createAssetWrites } from './write/assets';
import { createLibraryWrites } from './write/libraries';
import { createMarks } from './write/marks';
import { createPlacement } from './write/placement';

export function createStampController(
  ctx: StampContext,
  config: StampConfig = {},
): StampHostCapability {
  const services = createServices(ctx, config);
  const { events } = services;

  // Reads: pure projections of the store and the sidecar.
  const catalog = createCatalog(ctx, services);

  // Writes: every durable change, through the per-library mutation queue.
  const marks = createMarks(services);
  const libraries = createLibraryWrites(ctx, services);
  const assets = createAssetWrites(ctx, services, marks, libraries);
  const placement = createPlacement(ctx, services, config);

  const api = composeApi('stamp', [
    catalog.api,
    libraries.api,
    assets.api,
    placement.api,
    {
      // The change hooks are services, not areas.
      onLibraryChanged: events.libraryChanged.on,
      onLibraryCreated: events.libraryCreated.on,
      onLibraryUpdated: events.libraryUpdated.on,
      onLibraryDeleted: events.libraryDeleted.on,
      onAssetCreated: events.assetCreated.on,
      onAssetUpdated: events.assetUpdated.on,
      onAssetDeleted: events.assetDeleted.on,
      onArmChanged: events.armChanged.on,
    },
  ]) satisfies StampHostCapability;
  return api;
}
