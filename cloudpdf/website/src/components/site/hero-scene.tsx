'use client';

import {
  GlobalIcon,
  Link01Icon,
  Notebook01Icon,
  UserShield01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { useEffect, useRef, useState } from 'react';

import { CopyIcon, ReactLogo, SvelteLogo, VueLogo } from './icons';

type Tab = 'react' | 'svelte' | 'vue';

const SNIPPETS: Record<Tab, string> = {
  react: [
    '<span class="tk-kw">import</span> { <span class="tk-mod">CloudPDFViewer</span> }',
    '<span class="tk-kw">from</span> <span class="tk-str">\'@cloudpdf/react\'</span>',
    '',
    '<span class="tk-tag">&lt;CloudPDFViewer</span>',
    '  <span class="tk-attr">src</span>=<span class="tk-str">"https://.../proposal.pdf"</span>',
    '  <span class="tk-attr">accessToken</span>=<span class="tk-pun">{</span>token<span class="tk-pun">}</span>',
    '  <span class="tk-attr">annotations</span>',
    '  <span class="tk-attr">enableDownload</span>=<span class="tk-pun">{</span><span class="tk-kw">false</span><span class="tk-pun">}</span>',
    '  <span class="tk-attr">theme</span>=<span class="tk-str">"light"</span>',
    '<span class="tk-tag">/&gt;</span>',
  ].join('\n'),
  svelte: [
    '<span class="tk-tag">&lt;script&gt;</span>',
    '  <span class="tk-kw">import</span> { <span class="tk-mod">CloudPDFViewer</span> }',
    '    <span class="tk-kw">from</span> <span class="tk-str">\'@cloudpdf/svelte\'</span>',
    '<span class="tk-tag">&lt;/script&gt;</span>',
    '',
    '<span class="tk-tag">&lt;CloudPDFViewer</span>',
    '  <span class="tk-attr">src</span>=<span class="tk-str">"https://.../proposal.pdf"</span>',
    '  <span class="tk-attr">accessToken</span>=<span class="tk-pun">{</span>token<span class="tk-pun">}</span>',
    '  <span class="tk-attr">annotations</span>',
    '<span class="tk-tag">/&gt;</span>',
  ].join('\n'),
  vue: [
    '<span class="tk-tag">&lt;script setup&gt;</span>',
    '<span class="tk-kw">import</span> { <span class="tk-mod">CloudPDFViewer</span> }',
    '  <span class="tk-kw">from</span> <span class="tk-str">\'@cloudpdf/vue\'</span>',
    '<span class="tk-tag">&lt;/script&gt;</span>',
    '',
    '<span class="tk-tag">&lt;template&gt;</span>',
    '  <span class="tk-tag">&lt;CloudPDFViewer</span>',
    '    <span class="tk-attr">:src</span>=<span class="tk-str">"fileUrl"</span>',
    '    <span class="tk-attr">annotations</span>',
    '  <span class="tk-tag">/&gt;</span>',
    '<span class="tk-tag">&lt;/template&gt;</span>',
  ].join('\n'),
};

const TABS: { id: Tab; label: string; logo: typeof ReactLogo }[] = [
  { id: 'react', label: 'React', logo: ReactLogo },
  { id: 'svelte', label: 'Svelte', logo: SvelteLogo },
  { id: 'vue', label: 'Vue', logo: VueLogo },
];

const ACCESS_ITEMS: { label: string; icon: IconSvgElement }[] = [
  { label: 'Signed URLs', icon: Link01Icon },
  { label: 'Role-based access', icon: UserShield01Icon },
  { label: 'Domain restrictions', icon: GlobalIcon },
  { label: 'Audit logging', icon: Notebook01Icon },
];

export function HeroScene() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('react');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function fitScene() {
      const wrap = wrapRef.current;
      const scene = sceneRef.current;
      const pdf = pdfRef.current;
      if (!wrap || !scene) return;
      if (window.innerWidth <= 980) {
        scene.style.transform = '';
        wrap.style.height = '';
        if (pdf) pdf.style.width = '';
        return;
      }
      const w = wrap.clientWidth;
      const scale = Math.min(1, w / 840);
      scene.style.transform = `scale(${scale})`;
      wrap.style.height = `${650 * scale}px`;
      if (pdf) {
        const target = Math.min(590, w);
        pdf.style.width = `${target / scale}px`;
      }
    }
    fitScene();
    window.addEventListener('resize', fitScene);
    window.addEventListener('load', fitScene);
    return () => {
      window.removeEventListener('resize', fitScene);
      window.removeEventListener('load', fitScene);
    };
  }, []);

  function copy() {
    const text = SNIPPETS[tab]
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div ref={wrapRef} className="relative w-full max-[980px]:flex max-[980px]:justify-center">
      <div
        ref={sceneRef}
        className="relative h-[650px] w-[880px] origin-top-left max-[980px]:mx-auto max-[980px]:block max-[980px]:h-auto max-[980px]:w-full max-[980px]:max-w-[520px] max-[980px]:!transform-none"
      >
        {/* cloud backdrop */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/cloud-bg.svg"
          alt=""
          className="pointer-events-none absolute left-2 top-0 z-0 h-auto w-[864px] select-none max-[980px]:hidden"
        />
        {/* top-right dot grid */}
        <div className="cp-dots-fine absolute right-2 top-[-44px] z-0 h-[110px] w-[132px] origin-top-right scale-[0.78] text-[#ABC9FD] [mask-image:linear-gradient(115deg,#000_35%,transparent_92%)] max-[980px]:hidden" />

        {/* PDF mock */}
        <div
          ref={pdfRef}
          className="absolute left-16 top-11 z-[1] w-[590px] overflow-hidden rounded-[10px] border border-[#E6EAF2] bg-white shadow-[0_4px_10px_rgba(163,163,163,0.22)] max-[980px]:relative max-[980px]:left-auto max-[980px]:top-auto max-[980px]:w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pdf-viewer.svg"
            alt="CloudPDF viewer preview"
            className="block h-auto w-full"
          />
        </div>

        {/* code card */}
        <div className="absolute left-[556px] top-[100px] z-[4] w-[314px] overflow-hidden rounded-[14px] border border-[#21305F] bg-[#0E1A40] shadow-[0_22px_48px_-18px_rgba(8,24,72,0.55)] max-[980px]:bottom-[38px] max-[980px]:left-auto max-[980px]:right-[-10px] max-[980px]:top-auto max-[980px]:z-[6] max-[980px]:w-[64%] max-[980px]:max-w-[286px]">
          <div className="flex items-center justify-between border-b border-[#1E2C5A] bg-[#0A1638] p-1.5 text-[#6E82BC]">
            <div className="flex gap-0.5">
              {TABS.map(({ id, label, logo: Logo }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-sans text-[11px] font-semibold transition-colors ${
                    tab === id
                      ? 'bg-[#1E2C5A] text-white'
                      : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
                  }`}
                >
                  <Logo width={13} height={13} />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy code"
              className={`inline-flex p-0.5 transition-colors ${
                copied ? 'text-[#6FE0A0]' : 'text-[#6E82BC] hover:text-[#B7C6EA]'
              }`}
            >
              <CopyIcon width={15} height={15} />
            </button>
          </div>
          <pre
            className="cp-code-pre m-0 overflow-hidden whitespace-pre p-4 font-mono text-[12px] leading-[1.75] text-[#C8D3EA]"
            dangerouslySetInnerHTML={{ __html: SNIPPETS[tab] }}
          />
        </div>

        {/* access control card */}
        <div className="absolute left-6 top-[420px] z-[5] w-[234px] rounded-2xl border border-[#EAEFF7] bg-white px-4 pb-3.5 pt-4 shadow-[0_18px_40px_-16px_rgba(10,26,77,0.20),0_2px_6px_rgba(10,26,77,0.05)] max-[980px]:hidden">
          <div className="font-display text-cp-navy text-sm font-extrabold tracking-[-0.01em]">
            Access Control
          </div>
          <ul className="border-cp-borderSoft mt-3 flex list-none flex-col gap-0.5 border-t pt-2">
            {ACCESS_ITEMS.map(({ label, icon }) => (
              <li
                key={label}
                className="text-cp-navy flex items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 font-sans text-[12.5px] font-semibold transition-colors hover:bg-[rgba(22,119,255,0.06)]"
              >
                <span className="text-cp-blue inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg bg-[rgba(22,119,255,0.10)]">
                  <HugeiconsIcon icon={icon} size={15} strokeWidth={2} />
                </span>
                <span className="flex-1">{label}</span>
                <span className="bg-cp-blue relative h-[15px] w-[26px] flex-shrink-0 rounded-full after:absolute after:right-0.5 after:top-0.5 after:h-[11px] after:w-[11px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(10,26,77,0.3)] after:content-['']" />
              </li>
            ))}
          </ul>
        </div>

        {/* store anywhere card */}
        <div className="absolute left-[392px] top-[500px] z-[5] w-[398px] rounded-2xl border border-[#EAEFF7] bg-white px-5 pb-5 pt-4 shadow-[0_18px_40px_-16px_rgba(10,26,77,0.20),0_2px_6px_rgba(10,26,77,0.05)] max-[980px]:hidden">
          <div>
            <div className="font-display text-cp-navy text-[15px] font-extrabold tracking-[-0.01em]">
              Store anywhere.
            </div>
            <div className="text-cp-muted mt-0.5 font-sans text-[12.5px] font-medium">
              Deploy your way.
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {[
              { label: 'Amazon S3', icon: '/hero-section/aws.svg' },
              { label: 'Google Cloud', icon: '/hero-section/google-cloud.svg' },
              { label: 'Azure Blob', icon: '/hero-section/azure-cloud.svg' },
            ].map(({ label, icon }) => (
              <div
                key={label}
                className="border-cp-border group/store relative flex h-[64px] items-center justify-center rounded-xl border bg-gradient-to-b from-white to-[#FAFCFF] transition-all hover:border-[#CFE0FF] hover:shadow-[0_8px_18px_-10px_rgba(22,119,255,0.4)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon} alt={label} className="h-10 w-10 select-none object-contain" />
                <span className="bg-cp-navy after:border-t-cp-navy pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1 font-sans text-[11px] font-semibold text-white opacity-0 shadow-[0_6px_16px_-6px_rgba(8,24,72,0.6)] transition-opacity duration-150 after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-4 after:border-transparent after:content-[''] group-hover/store:opacity-100">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex gap-2.5">
            <span className="text-cp-blue flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-[rgba(22,119,255,0.32)] bg-[rgba(22,119,255,0.08)] py-2 font-sans text-[12.5px] font-bold">
              Managed SaaS
            </span>
            <span className="border-cp-border text-cp-navy flex flex-1 items-center justify-center gap-2 rounded-[10px] border py-2 font-sans text-[12.5px] font-bold">
              Self-hosted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
