'use client';

import dynamic from 'next/dynamic';

/**
 * The live demos, client-only (each boots the wasm engine) and split into
 * their own chunks: nothing loads until the comparison section mounts one.
 */
function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-[#F3F6FB]">
      <div className="flex items-center gap-3 font-sans text-sm font-medium text-[#5A6B92]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#C7DEFF] border-t-[#0876FD]" />
        {label}
      </div>
    </div>
  );
}

export const ReadyMadeViewerLazy = dynamic(
  () => import('./ready-made-viewer').then((module) => module.ReadyMadeViewer),
  { ssr: false, loading: () => <Loading label="Loading the viewer…" /> },
);

export const CustomViewerLazy = dynamic(
  () => import('./custom-viewer').then((module) => module.CustomViewer),
  { ssr: false, loading: () => <Loading label="Loading the custom viewer…" /> },
);
