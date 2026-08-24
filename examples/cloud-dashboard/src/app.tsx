import { useState } from 'react';

import { DocumentScreen } from './screens/document';
import { LibraryScreen } from './screens/library';
import { ShareDialog } from './share/ShareDialog';
import { useRoute } from './state/route';
import { StoreProvider, useStore } from './state/store';
import { Badge, Spinner } from './ui/primitives';

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { config, documents, loading, error } = useStore();
  const [route, navigate] = useRoute();
  // Transient UI, so it stays out of the URL — `?share=` already means "which
  // identity is VIEWING", and overloading it would conflate two ideas.
  const [sharingDocId, setSharingDocId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="text-cp-muted flex h-full items-center justify-center gap-3">
        <Spinner className="h-5 w-5" />
        <span className="text-sm">Connecting to CloudPDF…</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <p className="font-medium">Can’t reach the demo API.</p>
          <p className="mt-1">{error ?? 'Is `pnpm dev` running?'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar tenantId={config.tenantId} onHome={() => navigate({ docId: null, shareId: null })} />
      <main className="min-h-0 flex-1 overflow-auto">
        {route.docId ? (
          <DocumentScreen
            docId={route.docId}
            shareId={route.shareId}
            onBack={() => navigate({ docId: null, shareId: null })}
            onShare={() => setSharingDocId(route.docId)}
            onSelectShare={(shareId) => navigate({ shareId })}
          />
        ) : (
          <LibraryScreen
            onOpen={(docId) => navigate({ docId, shareId: null })}
            onShare={(docId) => setSharingDocId(docId)}
          />
        )}
      </main>

      {sharingDocId && (
        <ShareDialog
          docId={sharingDocId}
          docName={documents.find((d) => d.id === sharingDocId)?.name ?? sharingDocId}
          onClose={() => setSharingDocId(null)}
          onCreated={(share) => {
            setSharingDocId(null);
            // Land on the document AS the person you just invited — the whole
            // point is seeing the scopes you picked take effect.
            navigate({ docId: share.docId, shareId: share.id });
          }}
        />
      )}
    </div>
  );
}

function TopBar({ tenantId, onHome }: { tenantId: string; onHome: () => void }) {
  return (
    <header className="border-cp-border flex h-14 shrink-0 items-center gap-3 border-b bg-white px-5">
      <button type="button" onClick={onHome} className="flex items-center gap-2">
        <CloudMark className="text-cp-blue h-6 w-6" />
        <span className="font-display text-cp-navy text-[15px] font-extrabold tracking-tight">
          CloudPDF
        </span>
      </button>
      <span className="text-cp-border">/</span>
      <Badge>{tenantId}</Badge>
      <span className="flex-1" />
      <span className="text-cp-muted hidden text-xs sm:inline">
        Rendering runs on the server — no PDF engine in this bundle.
      </span>
    </header>
  );
}

function CloudMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.4 9.2 3.9 3.9 0 0 1 17 18H7Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.4 9.2 3.9 3.9 0 0 1 17 18H7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
