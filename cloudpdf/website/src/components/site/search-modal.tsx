'use client';

import { useEffect, useRef } from 'react';

import { ArrowRight, DocIcon, LinkIcon, SearchIcon } from './icons';

type Result = { title: string; description: string; icon: 'arrow' | 'link' | 'doc' };
type Group = { label: string; items: Result[] };

const GROUPS: Group[] = [
  {
    label: 'Getting started',
    items: [
      { title: 'Quick start', description: 'Render your first secure PDF', icon: 'arrow' },
      { title: 'Signed URLs', description: 'Authorize document access', icon: 'link' },
    ],
  },
  {
    label: 'API',
    items: [
      { title: 'CloudPDFViewer', description: 'React + Vue embed component', icon: 'arrow' },
      { title: 'Audit log API', description: 'Track every document event', icon: 'doc' },
    ],
  },
];

function ResultIcon({ icon }: { icon: Result['icon'] }) {
  if (icon === 'link') return <LinkIcon width={16} height={16} />;
  if (icon === 'doc') return <DocIcon width={16} height={16} />;
  return <ArrowRight width={16} height={16} />;
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-[rgba(7,32,76,0.45)] px-5 pb-5 pt-[clamp(40px,10vh,120px)] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] border border-[#E9EEFF] bg-white shadow-[0_20px_60px_rgba(7,32,76,0.25)]">
        <div className="flex items-center gap-3 border-b border-[#E9EEFF] px-[18px] py-4">
          <SearchIcon width={20} height={20} className="text-[#3D4E75]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search docs, components, API…"
            className="flex-1 border-none bg-transparent font-sans text-base font-medium text-[#07204C] outline-none placeholder:text-[#6B7B9D]"
          />
          <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-[#E9EEFF] bg-white px-1.5 font-mono text-[11px] font-semibold text-[#3D4E75] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
            ESC
          </kbd>
        </div>
        <div className="py-2">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="font-display px-[18px] pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B7B9D]">
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="flex w-full items-center gap-3 px-[18px] py-2.5 text-left hover:bg-[#F3F7FE]"
                >
                  <span className="bg-cp-surface text-cp-blue flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
                    <ResultIcon icon={item.icon} />
                  </span>
                  <span>
                    <span className="block font-sans text-sm font-semibold text-[#07204C]">
                      {item.title}
                    </span>
                    <span className="block font-sans text-[13px] text-[#6B7B9D]">
                      {item.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
