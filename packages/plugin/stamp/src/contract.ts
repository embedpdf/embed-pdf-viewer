/** @embedpdf/plugin-stamp/contract — the PUBLIC stamp vocabulary. */
import type { CapabilityToken } from '@embedpdf/core';
import { StampToken as StampHostToken } from './types';
import type { StampCapability } from './types';

export const StampToken = StampHostToken as unknown as CapabilityToken<StampCapability>;
export type {
  AddAssetInput,
  ImportLibraryOptions,
  MarkSource,
  StampArmChangedEvent,
  StampAsset,
  StampAssetEvent,
  StampAssetFilter,
  StampAssetKind,
  StampAssetPreview,
  StampCapability,
  StampConfig,
  StampLibrary,
  StampLibraryChange,
  StampLibraryEvent,
  StampLibraryFilter,
  StampLibraryKind,
} from './types';
export { DEFAULT_LIBRARY_KIND } from './convention';
export type { StampLibraryStore } from './persistence';
