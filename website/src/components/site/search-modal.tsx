'use client';

import { useEffect, useState } from 'react';

import { ChevronRightIcon, SearchIcon } from './icons';

const SEARCH_RESULTS = [
  {
    group: 'Getting started',
    items: [
      { title: 'Quick start', sub: 'Install and render your first PDF', icon: '🚀' },
      { title: 'Installation', sub: 'npm, pnpm, yarn, bun', icon: '📦' },
    ],
  },
  {
    group: 'Components',
    items: [
      { title: 'PDFViewer', sub: 'Drop-in viewer component', icon: '📄' },
      { title: 'Toolbar', sub: 'Customize zoom, search, download', icon: '🧰' },
      { title: 'Thumbnails', sub: 'Page navigation sidebar', icon: '🖼️' },
    ],
  },
  {
    group: 'Headless API',
    items: [
      { title: 'usePDFDocument()', sub: 'Load a document, get page count', icon: '⚡' },
      { title: 'useTextSearch()', sub: 'Highlight matches in-document', icon: '🔎' },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="border-ep-borderSoft inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border bg-white px-1.5 font-mono text-[11px] font-semibold text-[#3D4E75] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
      {children}
    </kbd>
  );
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = SEARCH_RESULTS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => !query || (i.title + i.sub).toLowerCase().includes(query.toLowerCase()),
    ),
  })).filter((g) => g.items.length);

  return (
    <div
      className="ep-anim-fade fixed inset-0 z-[1000] flex items-start justify-center bg-[rgba(7,32,76,0.45)] px-5 pb-5 pt-[clamp(40px,10vh,120px)] backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="ep-anim-slide border-ep-borderSoft flex max-h-[70vh] w-full max-w-[580px] flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_20px_60px_rgba(7,32,76,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-ep-borderSoft flex items-center gap-3 border-b px-[18px] py-4">
          <SearchIcon size={20} className="text-[#3D4E75]" />
          <input
            autoFocus
            type="text"
            placeholder="Search docs, components, API…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-ep-navy placeholder:text-ep-subtle flex-1 border-none bg-transparent font-sans text-base font-medium outline-none"
          />
          <Kbd>ESC</Kbd>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="text-ep-subtle px-6 py-10 text-center font-sans text-sm font-medium">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {filtered.map((group) => (
            <div key={group.group} className="py-1">
              <div className="font-display text-ep-subtle px-[18px] pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em]">
                {group.group}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.title}
                  className="hover:bg-ep-tint flex cursor-pointer items-center gap-3 px-[18px] py-2.5 transition-colors duration-100"
                >
                  <div className="bg-ep-mist flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-base">
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-ep-navy block font-sans text-sm font-semibold">
                      {item.title}
                    </b>
                    <span className="text-ep-subtle block font-sans text-[13px]">{item.sub}</span>
                  </div>
                  <ChevronRightIcon size={14} className="text-[#3D4E75]" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="border-ep-borderSoft text-ep-subtle flex gap-4 border-t bg-[#FAFBFC] px-[18px] py-2.5 font-sans text-xs font-medium">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Navigate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>⏎</Kbd> Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>ESC</Kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
