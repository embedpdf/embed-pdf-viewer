import { PdfDocumentObject, PdfErrorCode, Rotation } from '@embedpdf/models';
import { PluginRegistryConfig } from '../types/plugin';
import { PermissionConfig } from '../types/permissions';

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

  // View settings (set even during loading for when it succeeds)
  scale: number;
  rotation: Rotation;

  // Maps page index (0-based) to refresh version number
  // When a page is refreshed, its version is incremented
  pageRefreshVersions: Record<number, number>;

  // Per-document permission overrides (optional)
  permissions?: PermissionConfig;

  // Metadata
  loadStartedAt: number;
  loadedAt?: number;
}

export interface CoreState {
  documents: Record<string, DocumentState>;
  documentOrder: string[];
  activeDocumentId: string | null;
  defaultScale: number;
  defaultRotation: Rotation;
  /** Global permission configuration applied to all documents unless overridden per-document */
  globalPermissions?: PermissionConfig;
}

export const initialCoreState: (config?: PluginRegistryConfig) => CoreState = (config) => ({
  documents: {},
  documentOrder: [],
  activeDocumentId: null,
  defaultScale: config?.defaultScale ?? 1,
  defaultRotation: config?.defaultRotation ?? Rotation.Degree0,
  globalPermissions: config?.permissions,
});
