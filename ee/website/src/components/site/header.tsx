'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CpButton } from './button';
import { ArrowRight, SearchIcon } from './icons';
import { SearchModal } from './search-modal';

const CONTACT_EMAIL = 'hello@cloudpdf.com';

const NAV = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Enterprise', href: '#' },
];

export function Header() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [metaLabel, setMetaLabel] = useState('⌘');

  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setMetaLabel('Ctrl');
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isActive = (href: string) =>
    href !== '#' && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#EEF2FA] bg-white/[0.86] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[84px] w-full max-w-[1440px] items-center gap-6 px-[clamp(20px,4vw,78px)]">
        <Link href="/" aria-label="CloudPDF home" className="flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/CloudPDF-Logo.svg" alt="CloudPDF" className="block h-[34px] w-auto" />
        </Link>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="bg-cp-surface ml-auto hidden h-10 min-w-0 flex-[0_1_280px] cursor-pointer items-center gap-2.5 rounded-lg border border-[#C7DEFF] px-3 font-sans text-sm font-medium text-[#6B7B9D] transition-colors hover:border-[#97C9FD] hover:bg-[#DCE8FE] min-[1180px]:flex"
        >
          <SearchIcon width={16} height={16} className="text-[#3D4E75]" />
          <span className="flex-1 truncate text-left">Search docs…</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-[#E9EEFF] bg-white font-mono text-[11px] font-semibold text-[#3D4E75] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
              {metaLabel}
            </kbd>
            <kbd className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-[#E9EEFF] bg-white font-mono text-[11px] font-semibold text-[#3D4E75] shadow-[0_1px_0_rgba(14,26,64,0.06)]">
              K
            </kbd>
          </span>
        </button>

        <nav className="hidden gap-1 max-[1179px]:ml-auto min-[860px]:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`font-display hover:bg-cp-surface hover:text-cp-blue rounded-lg px-4 py-2.5 text-base font-bold no-underline transition-colors ${
                isActive(item.href) ? 'bg-cp-surface text-cp-blue' : 'text-cp-navy'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden flex-shrink-0 items-center gap-3.5 min-[860px]:flex">
          <CpButton href={`mailto:${CONTACT_EMAIL}`} variant="outline" size="sm">
            Contact sales
          </CpButton>
          <CpButton href="#" variant="primary" size="sm">
            <span>Start building</span>
            <ArrowRight width={18} height={18} />
          </CpButton>
        </div>

        {/* Mobile: search + burger */}
        <button
          type="button"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
          className="ml-auto cursor-pointer p-2 min-[860px]:hidden"
        >
          <SearchIcon width={22} height={22} className="text-[#07204C]" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="hover:bg-cp-surface relative h-11 w-11 cursor-pointer rounded-[10px] transition-colors min-[860px]:hidden"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`absolute left-[11px] h-[2.4px] w-[22px] rounded-sm bg-[#07204C] transition-all duration-300 ${
                i === 0 ? (mobileOpen ? 'top-[21px] rotate-45' : 'top-[15px]') : ''
              } ${i === 1 ? (mobileOpen ? 'top-[21px] opacity-0' : 'top-[21px]') : ''} ${
                i === 2 ? (mobileOpen ? 'top-[21px] -rotate-45' : 'top-[27px]') : ''
              }`}
            />
          ))}
        </button>
      </div>

      {/* Mobile nav panel */}
      <div
        className={`flex-col gap-0.5 overflow-hidden bg-white px-[clamp(20px,4vw,78px)] transition-all duration-300 min-[860px]:hidden ${
          mobileOpen
            ? 'flex max-h-[520px] border-t border-[#E9EEFF] pb-[22px] pt-3 opacity-100 shadow-[0_16px_30px_-22px_rgba(10,26,77,0.4)]'
            : 'flex max-h-0 border-t border-transparent opacity-0'
        }`}
      >
        {NAV.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`font-display hover:bg-cp-surface hover:text-cp-blue flex items-center gap-2.5 rounded-[10px] px-3.5 py-[15px] text-[17px] font-bold no-underline transition-colors ${
              isActive(item.href) ? 'bg-cp-surface text-cp-blue' : 'text-cp-navy'
            }`}
          >
            {item.label}
          </Link>
        ))}
        <div className="mx-1 my-2.5 h-px bg-[#EEF2FA]" />
        <CpButton href={`mailto:${CONTACT_EMAIL}`} variant="outline" size="sm" className="w-full">
          Contact sales
        </CpButton>
        <CpButton href="#" variant="primary" size="sm" className="mt-2.5 w-full">
          Start building
        </CpButton>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
