/** Stamp-library capability protocol without import/render/plugin wiring. */
export { StampToken } from './types';
export type {
  AddAssetInput,
  ImportLibraryOptions,
  MarkSource,
  StampAsset,
  StampAssetKind,
  StampAssetPreview,
  StampCapability,
  StampConfig,
  StampLibrary,
  StampLibraryChange,
  StampLibraryKind,
  StampLibraryQuery,
  StampState,
} from './types';
export {
  parseStampKey,
  stampKey,
  customStampName,
  assetIdFor,
  stampLibraryPieceInfo,
  stampPieceInfo,
  stampKindToPdfName,
  libraryKindToPdfName,
  libraryKindFromPdfName,
  DEFAULT_LIBRARY_KIND,
  STAMP_LIBRARY_PIECEINFO_APP,
  STAMP_PIECEINFO_APP,
  STAMP_PIECEINFO_VERSION,
} from './convention';
export type { StampKey } from './convention';
export type { StampLibraryStore } from './persistence';
