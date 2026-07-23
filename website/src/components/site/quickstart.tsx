'use client';

import { RocketIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState, type ReactNode } from 'react';

import { Eyebrow } from './eyebrow';
import { AngularIcon, CheckIcon, JsMark, ReactIcon, SvelteIcon, VueIcon } from './icons';

type Token = [text: string, type: string];

const QS_SNIPPETS: { id: string; label: string; icon: ReactNode; lines: Token[] }[] = [
  {
    id: 'js',
    label: 'Vanilla JS',
    icon: <JsMark small />,
    lines: [
      ['<', 'tag'],
      ['div', 'tag'],
      [' ', 'pun'],
      ['id', 'attr'],
      ['=', 'pun'],
      ['"pdf-viewer"', 'str'],
      [' ', 'pun'],
      ['style', 'attr'],
      ['=', 'pun'],
      ['"height: 500px"', 'str'],
      ['>', 'tag'],
      ['</', 'tag'],
      ['div', 'tag'],
      ['>', 'tag'],
      ['\n', ''],
      ['<', 'tag'],
      ['script', 'tag'],
      [' ', 'pun'],
      ['async', 'attr'],
      [' ', 'pun'],
      ['type', 'attr'],
      ['=', 'pun'],
      ['"module"', 'str'],
      ['>', 'tag'],
      ['\n', ''],
      ['  import', 'kw'],
      [' EmbedPDF ', 'pun'],
      ['from', 'kw'],
      [' ', 'pun'],
      ["'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js'", 'str'],
      [';', 'pun'],
      ['\n', ''],
      ['\n', ''],
      ['  const', 'kw'],
      [' viewer ', 'pun'],
      ['= ', 'pun'],
      ['EmbedPDF', 'fn'],
      ['.', 'pun'],
      ['init', 'fn'],
      ['(', 'pun'],
      ['{', 'pun'],
      ['\n', ''],
      ['    type', 'key'],
      [': ', 'pun'],
      ["'container'", 'str'],
      [',', 'pun'],
      ['\n', ''],
      ['    target', 'key'],
      [': ', 'pun'],
      ['document', 'fn'],
      ['.', 'pun'],
      ['getElementById', 'fn'],
      ['(', 'pun'],
      ['"pdf-viewer"', 'str'],
      ['),', 'pun'],
      ['\n', ''],
      ['    src', 'key'],
      [': ', 'pun'],
      ["'https://snippet.embedpdf.com/ebook.pdf'", 'str'],
      ['\n', ''],
      ['  })', 'pun'],
      ['\n', ''],
      ['</', 'tag'],
      ['script', 'tag'],
      ['>', 'tag'],
    ],
  },
  {
    id: 'react',
    label: 'React',
    icon: <ReactIcon size={16} />,
    lines: [
      ['import', 'kw'],
      [' { ', 'pun'],
      ['PDFViewer', 'fn'],
      [' } ', 'pun'],
      ['from', 'kw'],
      [' ', 'pun'],
      ["'@embedpdf/react-pdf-viewer'", 'str'],
      [';', 'pun'],
      ['\n', ''],
      ['\n', ''],
      ['export ', 'kw'],
      ['default ', 'kw'],
      ['function ', 'kw'],
      ['App', 'fn'],
      ['() {', 'pun'],
      ['\n', ''],
      ['  return ', 'kw'],
      ['(', 'pun'],
      ['\n', ''],
      ['    <', 'tag'],
      ['PDFViewer', 'tag'],
      ['\n', ''],
      ['      config', 'attr'],
      ['=', 'pun'],
      ['{{ ', 'pun'],
      ['src', 'key'],
      [': ', 'pun'],
      ["'https://snippet.embedpdf.com/ebook.pdf'", 'str'],
      [' }}', 'pun'],
      ['\n', ''],
      ['      style', 'attr'],
      ['=', 'pun'],
      ['{{ ', 'pun'],
      ['height', 'key'],
      [': ', 'pun'],
      ["'500px'", 'str'],
      [' }}', 'pun'],
      ['\n', ''],
      ['      onReady', 'attr'],
      ['=', 'pun'],
      ['{(', 'pun'],
      ['registry', 'pun'],
      [') => {', 'pun'],
      ['\n', ''],
      ['        console', 'fn'],
      ['.', 'pun'],
      ['log', 'fn'],
      ['(', 'pun'],
      ["'PDF viewer ready!'", 'str'],
      [', ', 'pun'],
      ['registry', 'pun'],
      [');', 'pun'],
      ['\n', ''],
      ['      }}', 'pun'],
      ['\n', ''],
      ['    /', 'pun'],
      ['>', 'tag'],
      ['\n', ''],
      ['  );', 'pun'],
      ['\n', ''],
      ['}', 'pun'],
    ],
  },
  {
    id: 'vue',
    label: 'Vue',
    icon: <VueIcon size={16} />,
    lines: [
      ['<', 'tag'],
      ['template', 'tag'],
      ['>', 'tag'],
      ['\n', ''],
      ['  <', 'tag'],
      ['PDFViewer', 'tag'],
      ['\n', ''],
      ['    :config', 'attr'],
      ['=', 'pun'],
      ['"{ src: ', 'str'],
      ["'https://snippet.embedpdf.com/ebook.pdf'", 'str'],
      [' }"', 'str'],
      ['\n', ''],
      ['    :style', 'attr'],
      ['=', 'pun'],
      ['"{ height: ', 'str'],
      ["'500px'", 'str'],
      [' }"', 'str'],
      ['\n', ''],
      ['    @ready', 'attr'],
      ['=', 'pun'],
      ['"onReady"', 'str'],
      ['\n', ''],
      ['  /', 'pun'],
      ['>', 'tag'],
      ['\n', ''],
      ['</', 'tag'],
      ['template', 'tag'],
      ['>', 'tag'],
      ['\n', ''],
      ['\n', ''],
      ['<', 'tag'],
      ['script', 'tag'],
      [' ', 'pun'],
      ['setup', 'attr'],
      [' ', 'pun'],
      ['lang', 'attr'],
      ['=', 'pun'],
      ['"ts"', 'str'],
      ['>', 'tag'],
      ['\n', ''],
      ['import', 'kw'],
      [' { ', 'pun'],
      ['PDFViewer', 'fn'],
      [' } ', 'pun'],
      ['from', 'kw'],
      [' ', 'pun'],
      ["'@embedpdf/vue-pdf-viewer'", 'str'],
      [';', 'pun'],
      ['\n', ''],
      ['\n', ''],
      ['function ', 'kw'],
      ['onReady', 'fn'],
      ['(', 'pun'],
      ['registry', 'pun'],
      [') {', 'pun'],
      ['\n', ''],
      ['  console', 'fn'],
      ['.', 'pun'],
      ['log', 'fn'],
      ['(', 'pun'],
      ["'PDF viewer ready!'", 'str'],
      [', ', 'pun'],
      ['registry', 'pun'],
      [');', 'pun'],
      ['\n', ''],
      ['}', 'pun'],
      ['\n', ''],
      ['</', 'tag'],
      ['script', 'tag'],
      ['>', 'tag'],
    ],
  },
  {
    id: 'svelte',
    label: 'Svelte',
    icon: <SvelteIcon size={16} />,
    lines: [
      ['<', 'tag'],
      ['script', 'tag'],
      [' ', 'pun'],
      ['lang', 'attr'],
      ['=', 'pun'],
      ['"ts"', 'str'],
      ['>', 'tag'],
      ['\n', ''],
      ['  import', 'kw'],
      [' { ', 'pun'],
      ['PDFViewer', 'fn'],
      [' } ', 'pun'],
      ['from', 'kw'],
      [' ', 'pun'],
      ["'@embedpdf/svelte-pdf-viewer'", 'str'],
      [';', 'pun'],
      ['\n', ''],
      ['\n', ''],
      ['  function ', 'kw'],
      ['onready', 'fn'],
      ['(', 'pun'],
      ['registry', 'pun'],
      [') {', 'pun'],
      ['\n', ''],
      ['    console', 'fn'],
      ['.', 'pun'],
      ['log', 'fn'],
      ['(', 'pun'],
      ["'PDF viewer ready!'", 'str'],
      [', ', 'pun'],
      ['registry', 'pun'],
      [');', 'pun'],
      ['\n', ''],
      ['  }', 'pun'],
      ['\n', ''],
      ['</', 'tag'],
      ['script', 'tag'],
      ['>', 'tag'],
      ['\n', ''],
      ['\n', ''],
      ['<', 'tag'],
      ['PDFViewer', 'tag'],
      ['\n', ''],
      ['  config', 'attr'],
      ['=', 'pun'],
      ['{{ ', 'pun'],
      ['src', 'key'],
      [': ', 'pun'],
      ["'https://snippet.embedpdf.com/ebook.pdf'", 'str'],
      [' }}', 'pun'],
      ['\n', ''],
      ['  style', 'attr'],
      ['=', 'pun'],
      ['"height: 500px"', 'str'],
      ['\n', ''],
      ['  {', 'pun'],
      ['onready', 'attr'],
      ['}', 'pun'],
      ['\n', ''],
      ['/', 'pun'],
      ['>', 'tag'],
    ],
  },
  {
    id: 'angular',
    label: 'Angular',
    icon: <AngularIcon size={16} />,
    lines: [
      ['import', 'kw'],
      [' { ', 'pun'],
      ['Component', 'fn'],
      [' } ', 'pun'],
      ['from', 'kw'],
      [' ', 'pun'],
      ["'@angular/core'", 'str'],
      [';', 'pun'],
      ['\n', ''],
      ['import', 'kw'],
      [' { ', 'pun'],
      ['PDFViewer', 'fn'],
      [' } ', 'pun'],
      ['from', 'kw'],
      [' ', 'pun'],
      ["'@embedpdf/angular-pdf-viewer'", 'str'],
      [';', 'pun'],
      ['\n', ''],
      ['\n', ''],
      ['@Component', 'fn'],
      ['({', 'pun'],
      ['\n', ''],
      ['  selector', 'key'],
      [': ', 'pun'],
      ["'app-root'", 'str'],
      [',', 'pun'],
      ['\n', ''],
      ['  imports', 'key'],
      [': ', 'pun'],
      ['[', 'pun'],
      ['PDFViewer', 'fn'],
      ['],', 'pun'],
      ['\n', ''],
      ['  template', 'key'],
      [': `', 'pun'],
      ['\n', ''],
      ['    <', 'tag'],
      ['pdf-viewer', 'tag'],
      ['\n', ''],
      ['      [config]', 'attr'],
      ['=', 'pun'],
      ['"{ src: ', 'str'],
      ["'https://snippet.embedpdf.com/ebook.pdf'", 'str'],
      [' }"', 'str'],
      ['\n', ''],
      ['      style', 'attr'],
      ['=', 'pun'],
      ['"height: 500px"', 'str'],
      ['\n', ''],
      ['      (ready)', 'attr'],
      ['=', 'pun'],
      ['"onReady($event)"', 'str'],
      ['\n', ''],
      ['    /', 'pun'],
      ['>', 'tag'],
      ['\n', ''],
      ['  `', 'pun'],
      [',', 'pun'],
      ['\n', ''],
      ['})', 'pun'],
      ['\n', ''],
      ['export ', 'kw'],
      ['class ', 'kw'],
      ['AppComponent', 'fn'],
      [' {', 'pun'],
      ['\n', ''],
      ['  onReady', 'fn'],
      ['(', 'pun'],
      ['registry', 'pun'],
      [') {', 'pun'],
      ['\n', ''],
      ['    console', 'fn'],
      ['.', 'pun'],
      ['log', 'fn'],
      ['(', 'pun'],
      ["'PDF viewer ready!'", 'str'],
      [', ', 'pun'],
      ['registry', 'pun'],
      [');', 'pun'],
      ['\n', ''],
      ['  }', 'pun'],
      ['\n', ''],
      ['}', 'pun'],
    ],
  },
];

const QS_RAW: Record<string, string> = {
  js: `<div id="pdf-viewer" style="height: 500px"></div>
<script async type="module">
  import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js';

  const viewer = EmbedPDF.init({
    type: 'container',
    target: document.getElementById("pdf-viewer"),
    src: 'https://snippet.embedpdf.com/ebook.pdf'
  })
</script>`,
  react: `import { PDFViewer } from '@embedpdf/react-pdf-viewer';

export default function App() {
  return (
    <PDFViewer
      config={{ src: 'https://snippet.embedpdf.com/ebook.pdf' }}
      style={{ height: '500px' }}
      onReady={(registry) => {
        console.log('PDF viewer ready!', registry);
      }}
    />
  );
}`,
  vue: `<template>
  <PDFViewer
    :config="{ src: 'https://snippet.embedpdf.com/ebook.pdf' }"
    :style="{ height: '500px' }"
    @ready="onReady"
  />
</template>

<script setup lang="ts">
import { PDFViewer } from '@embedpdf/vue-pdf-viewer';

function onReady(registry) {
  console.log('PDF viewer ready!', registry);
}
</script>`,
  svelte: `<script lang="ts">
  import { PDFViewer } from '@embedpdf/svelte-pdf-viewer';

  function onready(registry) {
    console.log('PDF viewer ready!', registry);
  }
</script>

<PDFViewer
  config={{ src: 'https://snippet.embedpdf.com/ebook.pdf' }}
  style="height: 500px"
  {onready}
/>`,
  angular: `import { Component } from '@angular/core';
import { PDFViewer } from '@embedpdf/angular-pdf-viewer';

@Component({
  selector: 'app-root',
  imports: [PDFViewer],
  template: \`
    <pdf-viewer
      [config]="{ src: 'https://snippet.embedpdf.com/ebook.pdf' }"
      style="height: 500px"
      (ready)="onReady($event)"
    />
  \`,
})
export class AppComponent {
  onReady(registry) {
    console.log('PDF viewer ready!', registry);
  }
}`,
};

const PERKS = [
  {
    tone: 'border-[rgba(8,118,253,0.25)] bg-[rgba(8,118,253,0.14)] text-[#6FB3FF]',
    title: 'Open source',
    desc: 'Apache-2.0 licensed and built transparently for the community.',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
      </svg>
    ),
  },
  {
    tone: 'border-[rgba(151,71,255,0.25)] bg-[rgba(151,71,255,0.14)] text-[#B796FF]',
    title: 'Production ready',
    desc: 'Secure, reliable, and trusted by thousands of developers.',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    tone: 'border-[rgba(58,192,122,0.25)] bg-[rgba(58,192,122,0.14)] text-[#6FE0A0]',
    title: 'Works with your stack',
    desc: 'Drop in with Vanilla JS, React, Vue, Svelte, and more.',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
        <path d="M12 22.08V12" />
      </svg>
    ),
  },
];

function DecoDots({ color, className }: { color: string; className: string }) {
  return (
    <svg
      className={className}
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden
    >
      {Array.from({ length: 36 }).map((_, i) => (
        <circle
          key={i}
          cx={10 + (i % 6) * 20}
          cy={10 + Math.floor(i / 6) * 20}
          r="2"
          fill={color}
          opacity="0.18"
        />
      ))}
    </svg>
  );
}

export function QuickStart() {
  const [active, setActive] = useState('js');
  const [copied, setCopied] = useState(false);
  const current = QS_SNIPPETS.find((s) => s.id === active)!;
  const lineCount = QS_RAW[active].split('\n').length;

  const onCopy = () => {
    void navigator.clipboard?.writeText(QS_RAW[active]).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <section className="ep-qs-bg relative z-[2] w-full pb-[clamp(110px,13vw,180px)] pt-[clamp(110px,11vw,160px)]">
      <div className="ep-qs-glare" aria-hidden />
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute right-[-120px] top-[60px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(151,71,255,0.22)_0%,transparent_65%)] blur-[40px]" />
        <DecoDots
          color="#0876FD"
          className="absolute left-8 top-[200px] opacity-35 brightness-[1.8]"
        />
        <DecoDots
          color="#9747FF"
          className="absolute bottom-20 right-8 opacity-35 brightness-[1.8]"
        />
      </div>

      <div className="relative z-[1] mx-auto flex w-full max-w-[980px] flex-col items-center px-[clamp(20px,4vw,40px)]">
        <div className="mb-6">
          <Eyebrow
            tone="dark"
            icon={
              <HugeiconsIcon icon={RocketIcon} size={14} strokeWidth={2} className="text-ep-blue" />
            }
          >
            Quick Start
          </Eyebrow>
        </div>
        <h2 className="font-display m-0 mb-5 text-center text-[clamp(36px,4.6vw,60px)] font-extrabold leading-[1.05] tracking-[-0.02em] text-white">
          Get started in <em className="ep-grad-blue not-italic">minutes</em>
        </h2>
        <p className="text-ep-faint mx-auto mb-11 mt-0 max-w-[540px] text-center font-sans text-[17px] leading-[1.6]">
          Copy, paste, and start embedding PDFs in seconds. No build step. No bloat. Works with your
          stack, today.
        </p>

        <div className="relative w-full max-w-[920px] overflow-hidden rounded-[18px] border border-[#1B2748] bg-[#0B1530] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_0_0_1px_rgba(8,118,253,0.15),0_30px_70px_-20px_rgba(0,0,0,0.6),0_12px_32px_-10px_rgba(8,118,253,0.15)]">
          <div
            className="relative flex items-stretch border-b border-[#18233D] bg-[#070C19] px-1.5"
            role="tablist"
          >
            {QS_SNIPPETS.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={active === s.id}
                onClick={() => setActive(s.id)}
                className={`font-display -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3.5 text-[13.5px] font-semibold transition-all duration-150 max-[720px]:px-3 ${
                  active === s.id
                    ? 'border-ep-blue bg-gradient-to-b from-[rgba(8,118,253,0.06)] to-transparent text-white'
                    : 'border-transparent text-[#6B7A99] hover:text-[#B8C5DD]'
                }`}
              >
                <span className="inline-flex h-[18px] w-[18px] items-center justify-center">
                  {s.icon}
                </span>
                <span className={active === s.id ? '' : 'max-[720px]:hidden'}>{s.label}</span>
              </button>
            ))}
            <span className="flex-1" />
            <button
              onClick={onCopy}
              aria-label="Copy code"
              className={`font-display my-auto mr-2 inline-flex items-center gap-1.5 rounded-lg border px-[11px] py-[7px] text-[12.5px] font-semibold transition-all duration-150 ${
                copied
                  ? 'border-[rgba(58,192,122,0.4)] bg-[rgba(58,192,122,0.12)] text-[#6FE0A0]'
                  : 'border-[#25324F] bg-[#18233D] text-[#B8C5DD] hover:border-[#314069] hover:bg-[#1F2C4A] hover:text-white'
              }`}
            >
              {copied ? (
                <>
                  <CheckIcon size={14} strokeWidth={2.5} />
                  Copied
                </>
              ) : (
                <>
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
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>

          <div className="ep-dark-scroll flex max-h-[420px] overflow-auto bg-[#0B1220]">
            <div
              aria-hidden
              className="flex-shrink-0 select-none border-r border-[#131C32] bg-[#080E1B] py-[22px] pl-[22px] pr-3.5 text-right font-mono text-[13px] leading-[1.65] text-[#3B4768] max-[720px]:py-[18px] max-[720px]:pl-3.5 max-[720px]:pr-2.5 max-[720px]:text-xs"
            >
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="ep-code ep-dark-scroll m-0 flex-1 overflow-x-auto whitespace-pre px-6 py-[22px] font-mono text-[13px] leading-[1.65] text-[#C8D3EA] [tab-size:2] max-[720px]:px-3.5 max-[720px]:py-[18px] max-[720px]:text-xs">
              <code>
                {current.lines.map(([text, type], i) =>
                  text === '\n' ? (
                    <br key={i} />
                  ) : type ? (
                    <span key={i} className={`tk-${type}`}>
                      {text}
                    </span>
                  ) : (
                    <span key={i}>{text}</span>
                  ),
                )}
              </code>
            </pre>
          </div>
        </div>

        <div className="mt-9 grid w-full gap-4 min-[721px]:grid-cols-3">
          {PERKS.map((perk) => (
            <div
              key={perk.title}
              className="flex items-start gap-3.5 rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-5 py-[18px] backdrop-blur-[4px]"
            >
              <div
                className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] border ${perk.tone}`}
              >
                {perk.icon}
              </div>
              <div>
                <h4 className="font-display m-0 mb-1 text-[15px] font-bold leading-[1.2] text-white">
                  {perk.title}
                </h4>
                <p className="text-ep-faint m-0 font-sans text-[13.5px] leading-[1.5]">
                  {perk.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
