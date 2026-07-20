'use client';

import { useState, type ReactNode } from 'react';

import { CheckIcon, ReactIcon, SvelteIcon, VueIcon } from './icons';

const SNIPPETS: Record<string, string> = {
  react: `import { PDFViewer } from '@embedpdf/react'

export default function App() {
  return (
    <PDFViewer
      src="./ebook.pdf"
      style={{ height: 500 }}
    />
  )
}`,
  svelte: `<script>
  import { PDFViewer } from '@embedpdf/svelte'
</script>

<PDFViewer
  src="./ebook.pdf"
  style="height: 500px"
/>`,
  vue: `<script setup>
import { PDFViewer } from '@embedpdf/vue'
</script>

<template>
  <PDFViewer
    src="./ebook.pdf"
    style="height: 500px"
  />
</template>`,
};

const TAB_ICONS: Record<string, ReactNode> = {
  react: <ReactIcon size={14} />,
  svelte: <SvelteIcon size={14} />,
  vue: <VueIcon size={14} />,
};

/** Single-pass tokenizer from the design kit — output is escaped before
 *  matching, so injected spans are never re-matched. */
function highlight(code: string): string {
  const tokens: [RegExp, string][] = [
    [/^(['"`])(?:\\.|(?!\1).)*\1/, '#A5E3B6'],
    [/^\/\/[^\n]*/, '#6B7B9D'],
    [
      /^\b(import|from|export|default|function|return|const|let|setup|template|script)\b/,
      '#7DB6FF',
    ],
    [/^&lt;\/?[A-Za-z][\w]*/, '#FFD580'],
    [/^&gt;/, '#FFD580'],
    [/^\b([a-z][a-zA-Z]*)(?==)/, '#FFB4E6'],
    [/^\b\d+\b/, '#FFB4E6'],
  ];
  let src = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '';
  while (src.length) {
    let matched = false;
    for (const [re, color] of tokens) {
      const m = src.match(re);
      if (m) {
        out += `<span style="color:${color}">${m[0]}</span>`;
        src = src.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += src[0];
      src = src.slice(1);
    }
  }
  return out;
}

export function HeroCode() {
  const [tab, setTab] = useState<'react' | 'svelte' | 'vue'>('react');
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(SNIPPETS[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#1E2C5A] bg-[#0E1A40] text-[#E6F0FF]">
      <div className="flex items-center justify-between border-b border-[#1E2C5A] bg-[#0A1638] py-2 pl-2.5 pr-2">
        <div className="flex gap-0.5">
          {(['react', 'svelte', 'vue'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-sans text-[11px] font-semibold transition-colors duration-150 ${
                tab === t
                  ? 'bg-[#1E2C5A] text-white'
                  : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
              }`}
            >
              {TAB_ICONS[t]}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          aria-label="Copy code"
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
            copied ? 'text-[#A5E3B6]' : 'text-[#8FA5D9] hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          {copied ? (
            <CheckIcon size={14} strokeWidth={2.5} />
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
      </div>
      <pre
        className="m-0 overflow-x-auto whitespace-pre p-[16px_18px] font-mono text-[11px] leading-[1.7] [tab-size:2]"
        dangerouslySetInnerHTML={{ __html: highlight(SNIPPETS[tab]) }}
      />
    </div>
  );
}
