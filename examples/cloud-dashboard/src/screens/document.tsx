import { CloudPDFViewer } from '@cloudpdf/viewer-react';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';
import type { Share } from '../api/types';
import { materializeScopes, roleById, roleLabel } from '../share/roles';
import { useDocumentShares, useStore } from '../state/store';
import { Badge, Button, Spinner } from '../ui/primitives';

/**
 * One document, opened AS somebody.
 *
 * The viewer here is the real product surface — `@cloudpdf/viewer-react` with
 * a doc-scoped token. There is no engine prop and no wasm in this bundle: the
 * cloud door supplies the engine, and every page, text run and annotation
 * arrives over HTTPS from the server.
 *
 * What the token carries is what the toolbar shows. Open the same document as
 * a Read-only share and the annotation tools are simply absent — the plugins
 * mirror `doc.security.allows(...)`, and the engine would refuse the write
 * anyway.
 */
export function DocumentScreen({
  docId,
  shareId,
  onBack,
  onShare,
  onSelectShare,
}: {
  docId: string;
  shareId: string | null;
  onBack: () => void;
  onShare: () => void;
  onSelectShare: (shareId: string) => void;
}) {
  const { documents, tenantId, addShare, sharesLoaded } = useStore();
  const shares = useDocumentShares(docId);
  const doc = documents.find((d) => d.id === docId);
  const [minting, setMinting] = useState(false);

  const active: Share | undefined = useMemo(
    () => shares.find((s) => s.id === shareId) ?? shares[0],
    [shares, shareId],
  );

  // Opening your own document shouldn't require issuing a share first: mint an
  // owner token once, then reuse it. Every OTHER identity is created
  // deliberately, through the share dialog.
  useEffect(() => {
    // Wait for the share list: minting against an empty-but-unloaded list
    // would issue a fresh owner token on every page load.
    if (!sharesLoaded || active || minting || !tenantId) return;
    setMinting(true);
    void (async () => {
      try {
        const owner = roleById('owner')!;
        const identity = { user_id: 'owner', display_name: 'You' };
        const share = await api.shares.create(tenantId, {
          docId,
          name: 'You',
          role: owner.id,
          layerName: 'default',
          scope: materializeScopes(owner, identity).scopes,
          identity,
          ttlSeconds: 3600,
          // React remounts this effect (StrictMode, navigation); the server
          // reuses the live owner share rather than minting a second token.
          idempotencyKey: `owner:${docId}`,
        });
        addShare(share);
      } finally {
        setMinting(false);
      }
    })();
  }, [active, minting, tenantId, docId, addShare]);

  if (!active) {
    return (
      <div className="text-cp-muted flex h-full items-center justify-center gap-3">
        <Spinner className="h-5 w-5" />
        <span className="text-sm">Issuing an access token…</span>
      </div>
    );
  }

  return (
    <div className="h-full">
      <CloudPDFViewer
        // Same-origin through the dev proxy — the SDK never needs an absolute
        // engine URL in a normal deployment either.
        baseUrl=""
        docToken={active.token}
        style={{ height: '100%' }}
      >
        <div
          slot="header"
          className="border-cp-border flex items-center gap-3 border-b bg-white px-4 py-2.5"
        >
          <Button size="sm" variant="ghost" onClick={onBack}>
            ← Library
          </Button>
          <span className="font-display text-cp-navy truncate text-sm font-bold">
            {doc?.name ?? docId}
          </span>

          <span className="flex-1" />

          <IdentityPicker shares={shares} activeId={active.id} onSelect={onSelectShare} />
          <Button size="sm" variant="primary" onClick={onShare}>
            Share
          </Button>
        </div>
      </CloudPDFViewer>
    </div>
  );
}

/**
 * "Viewing as …" — the demo's most important control. Switching identity
 * remounts the viewer against a different token, which is the whole pitch:
 * same document, different person, visibly different capabilities.
 */
function IdentityPicker({
  shares,
  activeId,
  onSelect,
}: {
  shares: Share[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const active = shares.find((s) => s.id === activeId);
  return (
    <label className="text-cp-muted flex items-center gap-2 text-xs">
      <span className="hidden sm:inline">Viewing as</span>
      <select
        value={activeId}
        onChange={(e) => onSelect(e.target.value)}
        className="border-cp-border text-cp-navy h-8 rounded-lg border bg-white px-2 text-[13px] font-medium"
      >
        {shares.map((share) => (
          <option key={share.id} value={share.id}>
            {share.name} · {roleLabel(share.role)}
          </option>
        ))}
      </select>
      {active && <Badge tone="blue">layer {active.layerName}</Badge>}
    </label>
  );
}
