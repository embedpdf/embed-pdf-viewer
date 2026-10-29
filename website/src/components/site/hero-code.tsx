'use client';

import { useState, type ReactNode } from 'react';

import { applyInstallChannel } from '@embedpdf/docs-kit/mdx/install-channel';

import { AngularIcon, CheckIcon, ReactIcon, SvelteIcon, VueIcon } from './icons';

/**
 * The docs' first-viewer snippets (viewer/start/first), with the props on their
 * own lines to fit the card, frameworks by popularity. Vanilla JS is the Quick
 * Start's paste-into-a-page snippet, CDN script included.
 */
const SNIPPETS: { id: string; label: string; icon: ReactNode; code: string }[] = [
  {
    id: 'react',
    label: 'React',
    icon: <ReactIcon className="size-[1.25em]" />,
    code: `import { PDFViewer } from '@embedpdf/viewer-react';

export function App() {
  return (
    <PDFViewer
      src="/report.pdf"
      style={{ height: '100vh' }}
    />
  );
}`,
  },
  {
    id: 'angular',
    label: 'Angular',
    icon: <AngularIcon className="size-[1.25em]" />,
    code: `import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: \`
    <epdf-pdf-viewer
      src="/report.pdf"
      style="height: 100vh"
    />
  \`,
})
export class App {}`,
  },
  {
    id: 'vue',
    label: 'Vue',
    icon: <VueIcon className="size-[1.25em]" />,
    code: `<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';
</script>

<template>
  <PDFViewer
    src="/report.pdf"
    style="height: 100vh"
  />
</template>`,
  },
  {
    id: 'svelte',
    label: 'Svelte',
    icon: <SvelteIcon className="size-[1.25em]" />,
    code: `<script lang="ts">
  import { PDFViewer } from '@embedpdf/viewer-svelte';
</script>

<PDFViewer
  src="/report.pdf"
  style="height: 100vh"
/>`,
  },
  {
    id: 'js',
    label: 'Vanilla JS',
    // The kit's JsMark is sized in px; this one scales with the card like the other icons.
    icon: (
      <span className="font-display inline-flex size-[1.25em] items-center justify-center rounded-[0.22em] bg-[#F7DF1E] text-black">
        <span className="text-[0.5em] font-extrabold leading-none">JS</span>
      </span>
    ),
    // The docs' release channel stamps the CDN URL, as it does on the docs pages.
    code: applyInstallChannel(`<div id="viewer" style="height: 100vh"></div>

<script type="module">
  import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js';

  EmbedPDF.init({
    target: '#viewer',
    src: '/report.pdf',
  });
</script>`),
  },
];

const linesOf = (code: string): string[] => code.split('\n');

/** A URL can be wider than any card, so it wraps at its slashes like an editor's word wrap. */
const wraps = (line: string): boolean => line.includes('://');

/** The card is as wide as the longest line that doesn't wrap. */
const LONGEST_LINE = Math.max(
  ...SNIPPETS.flatMap(({ code }) =>
    linesOf(code)
      .filter((l) => !wraps(l))
      .map((l) => l.length),
  ),
);

/** Every tab gets the tallest snippet's height, so switching tabs never resizes the card. */
const MOST_ROWS = Math.max(
  ...SNIPPETS.map(({ code }) =>
    linesOf(code).reduce(
      (rows, l) => rows + (wraps(l) ? Math.ceil(l.length / LONGEST_LINE) : 1),
      0,
    ),
  ),
);
const GUTTER_DIGITS = String(Math.max(...SNIPPETS.map(({ code }) => linesOf(code).length))).length;

/**
 * The card's width in em, borders aside: the longest line (1ch of a monospace
 * font is 0.602em), the gutter's digits, the paddings around both, and a little
 * slack. The font size is the card's width over this, so only URLs ever wrap.
 */
const CARD_WIDTH_EM = (LONGEST_LINE + GUTTER_DIGITS) * 0.602 + (0.8 + 0.6) + (0.9 + 0.8) + 0.2;
/** The card's two side borders and the gutter's. */
const BORDERS_PX = 3;

const STRING = /^(['"`])(?:\\.|(?!\1).)*\1/;

/** Single-pass tokenizer from the design kit — output is escaped before
 *  matching, so injected spans are never re-matched. Strings get a break
 *  opportunity after each slash, which is where a wrapping URL wraps. */
function highlight(code: string): string {
  const tokens: [RegExp, string][] = [
    [STRING, '#A5E3B6'],
    [/^\/\/[^\n]*/, '#6B7B9D'],
    [/^@[A-Za-z]\w*/, '#FFD580'],
    [
      /^\b(import|from|export|default|function|return|const|let|class|setup|template|script)\b/,
      '#7DB6FF',
    ],
    [/^&lt;\/?[A-Za-z][\w-]*/, '#FFD580'],
    [/^\/?&gt;/, '#FFD580'],
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
        const text = re === STRING ? m[0].replace(/\//g, '/<wbr>') : m[0];
        out += `<span style="color:${color}">${text}</span>`;
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

/**
 * Sized in em off one font size that follows the card's width, so the card
 * scales like an illustration: the parent decides the width, and the tabs and
 * the longest line always fit it (see CARD_WIDTH_EM).
 */
export function HeroCode() {
  const [tab, setTab] = useState(SNIPPETS[0].id);
  const [copied, setCopied] = useState(false);
  const snippet = SNIPPETS.find((s) => s.id === tab) ?? SNIPPETS[0];

  const copy = () => {
    void navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="@container w-full">
      <div
        className="w-full overflow-hidden rounded-xl border border-[#1E2C5A] bg-[#0E1A40] text-[#E6F0FF]"
        style={{
          fontSize: `min(11px, calc((100cqi - ${BORDERS_PX}px) / ${CARD_WIDTH_EM.toFixed(2)}))`,
        }}
      >
        <div className="flex items-center justify-between gap-[0.5em] border-b border-[#1E2C5A] bg-[#0A1638] py-[0.7em] pl-[0.9em] pr-[0.7em]">
          <div role="tablist" aria-label="Framework" className="flex gap-[0.2em]">
            {SNIPPETS.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={tab === s.id}
                onClick={() => setTab(s.id)}
                className={`inline-flex items-center gap-[0.5em] rounded-[0.5em] px-[0.8em] py-[0.5em] font-sans text-[1em] font-semibold leading-none transition-colors duration-150 ${
                  tab === s.id
                    ? 'bg-[#1E2C5A] text-white'
                    : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={copy}
            aria-label="Copy code"
            className={`inline-flex size-[2.4em] flex-shrink-0 items-center justify-center rounded-[0.5em] transition-colors duration-150 ${
              copied ? 'text-[#A5E3B6]' : 'text-[#8FA5D9] hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {copied ? (
              <CheckIcon strokeWidth={2.5} className="size-[1.25em]" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-[1.25em]"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        </div>
        <div
          className="relative overflow-hidden"
          style={{ height: `calc(${MOST_ROWS} * 1.65em + 2.6em)` }}
        >
          {/* The gutter's background runs the full height; each row draws its own number. */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 box-content border-r border-[#1A2756] bg-[#0B1535] pl-[0.8em] pr-[0.6em] font-mono"
            style={{ width: `${GUTTER_DIGITS}ch` }}
          />
          <pre className="relative m-0 py-[1.3em] font-mono leading-[1.65] [tab-size:2]">
            {linesOf(snippet.code).map((line, i) => {
              // A wrapped line continues two columns in from its own indent, without a number.
              const hang = line.length - line.trimStart().length + 2;
              return (
                <span key={i} className="flex">
                  <span
                    aria-hidden
                    className="box-content flex-shrink-0 select-none pl-[0.8em] pr-[0.6em] text-right text-[#4B5D91]"
                    style={{ width: `${GUTTER_DIGITS}ch` }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="min-w-0 flex-1 whitespace-pre-wrap pr-[0.8em] [overflow-wrap:anywhere]"
                    style={{
                      paddingLeft: `calc(0.9em + 1px + ${hang}ch)`,
                      textIndent: `-${hang}ch`,
                    }}
                    dangerouslySetInnerHTML={{ __html: highlight(line) }}
                  />
                </span>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
}
