'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { EpButton } from './button';
import { ChevronRightIcon, GitHubIcon, SearchIcon, SparkIcon } from './icons';
import { SearchModal } from './search-modal';

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Demo', href: '/demo' },
  { label: 'Sponsors', href: '/sponsors' },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/Mac/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#EEF2FA] bg-white/[0.86] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[84px] w-full max-w-[1440px] items-center gap-6 px-[clamp(20px,4vw,78px)]">
        <Link href="/" className="flex-shrink-0">
          <Image
            src="/embedpdf-logo.svg"
            alt="EmbedPDF"
            width={177}
            height={42}
            className="h-[42px] w-auto"
            priority
          />
        </Link>

        <Link
          href="/pro"
          aria-label="EmbedPDF Pro"
          className="hover:bg-ep-mist group hidden h-8 flex-shrink-0 items-center gap-1.5 rounded-full border border-[#E9EEFF] bg-[#F3F7FE] px-3 transition-all duration-150 hover:border-[#C7DEFF] min-[769px]:inline-flex"
        >
          <SparkIcon size={13} className="text-ep-blue flex-shrink-0" />
          <span className="from-ep-navy to-ep-blue hidden bg-gradient-to-r bg-clip-text font-sans text-[13px] font-bold text-transparent min-[1025px]:inline">
            EmbedPDF Pro
          </span>
          <ChevronRightIcon
            size={11}
            className="text-ep-subtle group-hover:text-ep-blue transition-all duration-150 group-hover:translate-x-0.5"
          />
        </Link>

        <button
          onClick={() => setSearchOpen(true)}
          className="bg-ep-mist text-ep-subtle hover:bg-ep-mistDeep ml-auto hidden h-10 min-w-0 flex-[0_1_280px] items-center gap-2.5 rounded-lg border border-[#C7DEFF] px-3 font-sans text-sm font-medium transition-all duration-150 hover:border-[#97C9FD] min-[1181px]:flex"
        >
          <SearchIcon size={16} className="text-[#3D4E75]" />
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
            Search docs…
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-[#E9EEFF] bg-white px-1.5 font-mono text-[11px] font-semibold text-[#3D4E75] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-[#E9EEFF] bg-white font-mono text-[11px] font-semibold text-[#3D4E75] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
              K
            </kbd>
          </span>
        </button>

        <nav className="hidden gap-1 min-[769px]:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="font-display hover:bg-ep-mist hover:text-ep-blue rounded-lg px-4 py-2.5 text-base font-bold text-black transition-colors duration-150"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden flex-shrink-0 items-center gap-4 min-[769px]:flex">
          <a
            href="https://github.com/embedpdf/embed-pdf-viewer"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on GitHub"
            className="text-ep-navy hover:text-ep-blue inline-flex h-[42px] w-[42px] items-center justify-center rounded-[10px] transition-all duration-150 hover:-translate-y-px hover:bg-[rgba(8,118,253,0.08)]"
          >
            <GitHubIcon size={22} />
          </a>
          <EpButton href="/docs" variant="primary" icon="arrow">
            Get Started
          </EpButton>
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="ml-auto p-2 min-[769px]:hidden"
        >
          <SearchIcon size={22} strokeWidth={2.5} className="text-ep-navy" />
        </button>

        <button onClick={() => setOpen(!open)} aria-label="Menu" className="p-2 min-[769px]:hidden">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#07204C"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t border-[#E9EEFF] bg-white px-[clamp(20px,4vw,78px)] py-4 min-[769px]:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="font-display hover:bg-ep-mist rounded-lg px-3 py-3.5 text-lg font-bold text-black"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 self-start">
            <EpButton href="/docs" variant="primary" icon="arrow">
              Get Started
            </EpButton>
          </div>
        </div>
      )}

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
