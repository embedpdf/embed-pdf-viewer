import { PdfDocumentObject, PdfErrorCode, PdfPageObject, Rotation } from '@embedpdf/models';
import { PluginRegistryConfig } from '../types/plugin';

export type DocumentStatus = 'loading' | 'loaded' | 'error';

export interface DocumentState {
  id: string;
  name?: string;
  // Lifecycle status
  status: DocumentStatus;

  // Loading progress (0-100)
  loadingProgress?: number;

  // Error information (when status is 'error')
  error: string | null;
  errorCode?: PdfErrorCode;
  errorDetails?: any;

  // Track if this load attempt included a password
  passwordProvided?: boolean;

  // Document data (null when loading or error)
  document: PdfDocumentObject | null;
  pages: PdfPageObject[][];

  // View settings (set even during loading for when it succeeds)
  scale: number;
  rotation: Rotation;

  // Metadata
  loadStartedAt: number;
  loadedAt?: number;
}

export interface CoreState {
  documents: Record<string, DocumentState>;
  activeDocumentId: string | null;
  defaultScale: number;
  defaultRotation: Rotation;
}

export const initialCoreState: (config?: PluginRegistryConfig) => CoreState = (config) => ({
  documents: {},
  activeDocumentId: null,
  defaultScale: config?.defaultScale ?? 1,
  defaultRotation: config?.defaultRotation ?? Rotation.Degree0,
});
