'use client';

import dynamic from 'next/dynamic';

const LivePdfViewer = dynamic(
  () => import('./live-pdf-viewer').then((module) => module.LivePdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#F3F6FB]">
        <div className="flex items-center gap-3 font-sans text-sm font-medium text-[#5A6B92]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#C7DEFF] border-t-[#0876FD]" />
          Loading the viewer…
        </div>
      </div>
    ),
  },
);

export function ViewerFrame({ variant = 'showcase' }: { variant?: 'showcase' | 'demo' }) {
  const height =
    variant === 'demo'
      ? 'h-[max(620px,calc(100svh-250px))] max-h-[900px]'
      : 'h-[clamp(540px,62vw,760px)]';

  return (
    <div
      className={`relative overflow-hidden rounded-[18px] border border-[rgba(7,32,76,0.13)] bg-white shadow-[0_2px_5px_rgba(7,32,76,0.05),0_24px_70px_-22px_rgba(7,32,76,0.28)] ${height}`}
    >
      <div className="flex h-11 items-center border-b border-[#E6EAF2] bg-white px-4">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B6B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFD166]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#57CC99]" />
        </div>
        <div className="mx-auto flex h-7 w-[min(440px,58%)] items-center justify-center rounded-lg border border-[#E9EEFF] bg-[#F7F9FD] px-3 font-sans text-[11px] font-medium text-[#6B7B9D]">
          embedpdf.com/demo
        </div>
        <span className="w-[44px]" aria-hidden />
      </div>
      <div className="h-[calc(100%-44px)]">
        <LivePdfViewer />
      </div>
    </div>
  );
}
