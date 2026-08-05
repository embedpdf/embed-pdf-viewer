import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { api } from '../api/client';
import type { DemoConfig, DemoDocument, Share } from '../api/types';

/**
 * One store for the whole dashboard: the tenant we're acting as, its documents,
 * and the shares minted for them. Small enough to be a context + hooks — the
 * demo's complexity is in what it *shows*, not in its state machine.
 */

export interface UploadTask {
  id: string;
  name: string;
  /** 0..1 while sending; `null` once the server is processing (ingest + warm). */
  progress: number | null;
  error?: string;
}

interface Store {
  config: DemoConfig | null;
  tenantId: string;
  documents: DemoDocument[];
  shares: Share[];
  /** False until the first shares fetch lands — callers that create shares
   *  on demand must wait, or they mint a duplicate on every page load. */
  sharesLoaded: boolean;
  uploads: UploadTask[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upload: (files: File[]) => Promise<void>;
  removeDocument: (docId: string) => Promise<void>;
  removeShare: (shareId: string) => Promise<void>;
  addShare: (share: Share) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [documents, setDocuments] = useState<DemoDocument[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [sharesLoaded, setSharesLoaded] = useState(false);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tenantId = config?.tenantId ?? '';

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [docs, shareList] = await Promise.all([
        api.documents.list(tenantId),
        api.shares.list(tenantId),
      ]);
      setDocuments(docs);
      setShares(shareList);
      setSharesLoaded(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [tenantId]);

  useEffect(() => {
    void (async () => {
      try {
        setConfig(await api.config());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Thumbnails are warmed AFTER commit (`warmDocumentThumbnail` is
  // fire-and-forget), so a freshly uploaded document lands `pending` and turns
  // `ready` a beat later. Poll only while something is actually pending.
  const pending = documents.some((d) => d.thumbnailState === 'pending' || d.state === 'pending');
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [pending, refresh]);

  const uploadSeq = useRef(0);
  const upload = useCallback(
    async (files: File[]) => {
      if (!tenantId) return;
      await Promise.all(
        files.map(async (file) => {
          const id = `upload-${++uploadSeq.current}`;
          setUploads((prev) => [...prev, { id, name: file.name, progress: 0 }]);
          const patch = (next: Partial<UploadTask>) =>
            setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)));
          try {
            await api.documents.upload(tenantId, file, (fraction) =>
              patch({ progress: fraction < 1 ? fraction : null }),
            );
            setUploads((prev) => prev.filter((u) => u.id !== id));
          } catch (err) {
            patch({ error: err instanceof Error ? err.message : String(err), progress: null });
          }
        }),
      );
      await refresh();
    },
    [tenantId, refresh],
  );

  const removeDocument = useCallback(
    async (docId: string) => {
      // Optimistic: the grid should not sit there with a tombstone while the
      // delete round-trips.
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      await api.documents.remove(tenantId, docId);
      await refresh();
    },
    [tenantId, refresh],
  );

  const removeShare = useCallback(
    async (shareId: string) => {
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      await api.shares.remove(tenantId, shareId);
      await refresh();
    },
    [tenantId, refresh],
  );

  const addShare = useCallback((share: Share) => {
    setShares((prev) => [share, ...prev]);
  }, []);

  const value = useMemo<Store>(
    () => ({
      config,
      tenantId,
      documents,
      shares,
      sharesLoaded,
      uploads,
      loading,
      error,
      refresh,
      upload,
      removeDocument,
      removeShare,
      addShare,
    }),
    [
      config,
      tenantId,
      documents,
      shares,
      sharesLoaded,
      uploads,
      loading,
      error,
      refresh,
      upload,
      removeDocument,
      removeShare,
      addShare,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

/** Shares for one document, newest first. */
export function useDocumentShares(docId: string | null): Share[] {
  const { shares } = useStore();
  return useMemo(() => (docId ? shares.filter((s) => s.docId === docId) : []), [shares, docId]);
}
