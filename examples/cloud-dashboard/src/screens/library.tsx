import { useCallback, useRef, useState, type DragEvent } from 'react';

import { api } from '../api/client';
import type { DemoDocument } from '../api/types';
import { useStore } from '../state/store';
import { Badge, Button, Spinner, cx, formatBytes, formatWhen } from '../ui/primitives';

/**
 * The library: everything this tenant has uploaded, each tile showing its
 * page-1 render. Those tiles are the demo's first argument — they were
 * rasterized on the server at ingest (WS2 warms them at commit) and arrive as
 * plain images, so server-side rendering is proven before anything is clicked.
 */
export function LibraryScreen({
  onOpen,
  onShare,
}: {
  onOpen: (docId: string) => void;
  /** Open the share dialog for this document. */
  onShare: (docId: string) => void;
}) {
  const { documents, uploads, upload, tenantId, error } = useStore();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const acceptFiles = useCallback(
    (list: FileList | null) => {
      const files = Array.from(list ?? []).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );
      if (files.length) void upload(files);
    },
    [upload],
  );

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <div
      className="mx-auto w-full max-w-6xl px-6 py-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-cp-navy text-2xl font-extrabold tracking-tight">
            Documents
          </h1>
          <p className="text-cp-muted mt-1 text-sm">
            Uploaded to your CloudPDF tenant. Thumbnails are rendered server-side at ingest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => {
              acceptFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button variant="primary" onClick={() => fileInput.current?.click()}>
            Upload PDF
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div
        className={cx(
          'rounded-2xl border-2 border-dashed transition-colors',
          dragging ? 'border-cp-blue bg-cp-surface/60' : 'border-transparent',
        )}
      >
        {documents.length === 0 && uploads.length === 0 ? (
          <EmptyLibrary onPick={() => fileInput.current?.click()} />
        ) : (
          <div className="grid grid-cols-2 gap-4 p-1 sm:grid-cols-3 lg:grid-cols-4">
            {uploads.map((task) => (
              <article
                key={task.id}
                className="border-cp-border flex flex-col overflow-hidden rounded-xl border bg-white"
              >
                <div className="bg-cp-surface/50 flex aspect-[3/4] items-center justify-center">
                  {task.error ? (
                    <span className="px-4 text-center text-xs text-red-600">{task.error}</span>
                  ) : (
                    <div className="text-cp-muted flex flex-col items-center gap-2">
                      <Spinner className="h-5 w-5" />
                      <span className="text-xs">
                        {task.progress == null
                          ? 'Processing…'
                          : `Uploading ${Math.round(task.progress * 100)}%`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="border-cp-border border-t px-3 py-2.5">
                  <p className="text-cp-navy truncate text-sm font-medium">{task.name}</p>
                </div>
              </article>
            ))}
            {documents.map((doc) => (
              <DocumentTile
                key={doc.id}
                doc={doc}
                tenantId={tenantId}
                onOpen={() => onOpen(doc.id)}
                onShare={() => onShare(doc.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentTile({
  doc,
  tenantId,
  onOpen,
  onShare,
}: {
  doc: DemoDocument;
  tenantId: string;
  onOpen: () => void;
  onShare: () => void;
}) {
  const { removeDocument } = useStore();
  return (
    <article className="border-cp-border hover:shadow-cp-navy/5 group flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={onOpen}
        className="bg-cp-surface/40 relative block aspect-[3/4] w-full overflow-hidden"
        title={`Open ${doc.name}`}
      >
        <Thumbnail doc={doc} tenantId={tenantId} />
        <span className="bg-cp-navy/40 absolute inset-0 hidden items-center justify-center group-hover:flex">
          <span className="text-cp-navy rounded-lg bg-white px-3 py-1.5 text-sm font-medium">
            Open
          </span>
        </span>
      </button>

      <div className="border-cp-border flex items-start justify-between gap-2 border-t px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-cp-navy truncate text-sm font-medium" title={doc.name}>
            {doc.name}
          </p>
          <p className="text-cp-muted mt-0.5 text-xs">
            {formatBytes(doc.sizeBytes)} · {formatWhen(doc.createdAt)}
          </p>
        </div>
        {doc.shareCount > 0 && (
          <Badge tone="violet">
            {doc.shareCount} share{doc.shareCount === 1 ? '' : 's'}
          </Badge>
        )}
      </div>

      <div className="border-cp-border-soft flex items-center gap-1 border-t px-2 py-1.5">
        <Button size="sm" variant="ghost" onClick={onShare}>
          Share
        </Button>
        <a
          className="text-cp-muted hover:bg-cp-surface hover:text-cp-ink inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium transition-colors"
          href={api.documents.downloadUrl(tenantId, doc.id)}
          download
        >
          Download
        </a>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            if (confirm(`Delete “${doc.name}”? This removes it from the tenant.`)) {
              void removeDocument(doc.id);
            }
          }}
        >
          Delete
        </Button>
      </div>
    </article>
  );
}

/**
 * The warmed page-1 tile. `pending` is a real state, not a spinner-shaped lie:
 * ingest commits the document first and warms the tile right after, so a fresh
 * upload genuinely has no image for a moment.
 */
function Thumbnail({ doc, tenantId }: { doc: DemoDocument; tenantId: string }) {
  if (doc.thumbnailState === 'ready') {
    return (
      <img
        src={api.documents.thumbnailUrl(tenantId, doc.id)}
        alt=""
        className="h-full w-full object-cover object-top"
        loading="lazy"
      />
    );
  }
  const label =
    doc.thumbnailState === 'locked'
      ? 'Password protected'
      : doc.thumbnailState === 'failed'
        ? 'No preview'
        : 'Rendering…';
  return (
    <div className="text-cp-muted flex h-full w-full flex-col items-center justify-center gap-2">
      {doc.thumbnailState === 'pending' ? (
        <Spinner className="h-5 w-5" />
      ) : (
        <LockIcon className="h-5 w-5" />
      )}
      <span className="text-xs">{label}</span>
    </div>
  );
}

function EmptyLibrary({ onPick }: { onPick: () => void }) {
  return (
    <div className="border-cp-border relative overflow-hidden rounded-2xl border bg-white px-6 py-20 text-center">
      <div className="cp-dots text-cp-surface pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative">
        <h2 className="font-display text-cp-navy text-lg font-bold">Drop a PDF to get started</h2>
        <p className="text-cp-muted mx-auto mt-2 max-w-md text-sm">
          Files are uploaded to your CloudPDF tenant, rendered on the server, and shared with
          scoped, expiring links — no PDF engine ships to the browser.
        </p>
        <Button variant="primary" className="mt-5" onClick={onPick}>
          Choose a file
        </Button>
      </div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
