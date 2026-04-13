import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  PdfAnnotationName,
  PdfAnnotationObject,
  PdfDocumentObject,
  PdfTask,
  Rect,
  Rotation,
} from '@embedpdf/models';

export interface RubberStampToolContext {
  appearance: ArrayBuffer;
  ghostUrl: string;
  stampSize: { width: number; height: number };
  libraryId: string;
  stamp: StampDefinition;
  pageRotation: Rotation;
}

declare module '@embedpdf/plugin-annotation' {
  interface ToolContextMap {
    rubberStamp: RubberStampToolContext;
  }
}

export interface StampDefinition {
  id: string;
  pageIndex: number;
  name: PdfAnnotationName;
  subject: string;
  subjectKey?: string;
  label?: string;
  categories?: string[];
}

export type StampDefinitionUpdate = Partial<
  Pick<StampDefinition, 'subject' | 'subjectKey' | 'categories'>
>;

export interface StampLibraryConfig {
  id?: string;
  name: string;
  nameKey?: string;
  pdf: string | ArrayBuffer;
  stamps: StampDefinition[];
  categories?: string[];
  readonly?: boolean;
}

export type StampLibraryUpdate = Partial<
  Pick<StampLibrary, 'name' | 'nameKey' | 'categories' | 'readonly'>
>;

export interface StampLibrary {
  id: string;
  name: string;
  nameKey?: string;
  document: PdfDocumentObject;
  stamps: StampDefinition[];
  categories?: string[];
  readonly: boolean;
}

export interface ResolvedStamp {
  library: StampLibrary;
  stamp: StampDefinition;
}

export interface ExportedStampLibrary {
  name: string;
  pdf: ArrayBuffer;
  stamps: StampDefinition[];
  categories?: string[];
}

export interface StampManifestSource {
  url: string;
  fallbackLocale?: string;
}

export interface StampManifest {
  id?: string;
  name: string;
  nameKey?: string;
  pdf: string;
  stamps: StampManifestEntry[];
  categories?: string[];
}

export interface StampManifestEntry {
  id?: string;
  pageIndex: number;
  name?: string;
  subject: string;
  subjectKey?: string;
  label?: string;
  categories?: string[];
}

export interface DefaultLibraryConfig {
  id?: string;
  name?: string;
  nameKey?: string;
  categories?: string[];
}

export interface StampPluginConfig extends BasePluginConfig {
  libraries?: StampLibraryConfig[];
  manifests?: StampManifestSource[];
  defaultLibrary?: DefaultLibraryConfig | false;
}

export interface StampState {
  libraryIds: string[];
}

export interface ActiveStampInfo {
  libraryId: string;
  stamp: StampDefinition;
}

export interface ActiveStampChangeEvent {
  documentId: string;
  activeStamp: ActiveStampInfo | null;
}

export interface StampScope {
  createStampFromAnnotation(
    annotation: PdfAnnotationObject,
    stamp: Omit<StampDefinition, 'id' | 'pageIndex'>,
    libraryId?: string,
  ): PdfTask<void>;

  createStampFromAnnotations(
    annotations: PdfAnnotationObject[],
    stamp: Omit<StampDefinition, 'id' | 'pageIndex'>,
    libraryId?: string,
  ): PdfTask<void>;

  activateStampPlacement(libraryId: string, stamp: StampDefinition): PdfTask<void>;
  activateStampPlacementById(libraryId: string, stampId: string): PdfTask<void>;
  getActiveStamp(): ActiveStampInfo | null;
  onActiveStampChange: EventHook<ActiveStampInfo | null>;
}

export interface StampCapability {
  getLibraries(): StampLibrary[];
  getStampsByCategory(category: string): ResolvedStamp[];
  renderStamp(libraryId: string, pageIndex: number, width: number, dpr?: number): PdfTask<Blob>;
  loadLibrary(config: StampLibraryConfig): PdfTask<string>;
  loadLibraryFromManifest(url: string): PdfTask<string>;
  createNewLibrary(
    name: string,
    options?: { categories?: string[]; id?: string; nameKey?: string; readonly?: boolean },
  ): PdfTask<string>;
  addStampToLibrary(
    libraryId: string,
    stamp: Omit<StampDefinition, 'id' | 'pageIndex'>,
    pdf: ArrayBuffer,
  ): PdfTask<void>;
  removeStampFromLibrary(libraryId: string, stampId: string): PdfTask<void>;
  updateStamp(libraryId: string, stampId: string, updates: StampDefinitionUpdate): PdfTask<void>;
  updateLibrary(libraryId: string, updates: StampLibraryUpdate): PdfTask<void>;
  removeLibrary(id: string): PdfTask<void>;
  exportLibrary(id: string): PdfTask<ExportedStampLibrary>;
  forDocument(documentId: string): StampScope;
  onActiveStampChange: EventHook<ActiveStampChangeEvent>;
  onLibraryChange: EventHook<StampLibrary[]>;
}
