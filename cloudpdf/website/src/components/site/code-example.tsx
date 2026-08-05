'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

import {
  CheckIcon,
  ChevronDown,
  CodeIcon,
  CopyIcon,
  ExternalLink,
  GithubIcon,
  ReactLogo,
  SvelteLogo,
  VueLogo,
} from './icons';

interface CodeFile {
  filename: string;
  code: string;
  language: string;
  githubUrl?: string;
  highlightedCode?: string;
}

interface CodeExampleProps {
  children: ReactNode;
  files?: CodeFile[];
  framed?: boolean;
  background?: 'dots' | 'solid' | 'none';
  code?: string;
  language?: string;
  highlightedCode?: string;
  githubUrl?: string;
}

const backgroundStyles: Record<NonNullable<CodeExampleProps['background']>, string> = {
  dots: '',
  solid: 'bg-cp-surface',
  none: 'bg-white',
};

const dotsBackground =
  'radial-gradient(circle, #DDE7F6 1px, transparent 1.4px) 0 0 / 20px 20px, linear-gradient(180deg, #F7FAFE 0%, #EFF4FC 100%)';

function FrameworkIcon({ language, active = false }: { language: string; active?: boolean }) {
  const lang = language.toLowerCase();
  if (lang === 'tsx' || lang === 'jsx') return <ReactLogo width={15} height={15} />;
  if (lang === 'vue') return <VueLogo width={14} height={14} />;
  if (lang === 'svelte') return <SvelteLogo width={13} height={13} />;
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="currentColor"
      className={active ? 'text-[#82AAFF]' : 'text-[#5E72A8]'}
    >
      <path
        fillRule="evenodd"
        d="M4 1.75A1.75 1.75 0 0 1 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 14.25 16H5.75A1.75 1.75 0 0 1 4 14.25V1.75zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073H5.75z"
      />
    </svg>
  );
}

export function CodeExample({
  children,
  files = [],
  framed = false,
  background = 'dots',
  code,
  language = 'tsx',
  highlightedCode,
  githubUrl: legacyGithubUrl,
}: CodeExampleProps) {
  const [showCode, setShowCode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const allFiles: CodeFile[] =
    files.length > 0
      ? files
      : code
        ? [{ filename: 'Example.tsx', code, language, highlightedCode, githubUrl: legacyGithubUrl }]
        : [];

  const activeFile = allFiles[activeTab];
  const filesWithGithub = allFiles.filter((f) => f.githubUrl);
  const repoGithubUrl = filesWithGithub[0]?.githubUrl;

  async function copyToClipboard() {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="not-prose border-cp-border my-8 overflow-hidden rounded-[16px] border bg-white shadow-[0_1px_2px_rgba(10,26,77,0.05)]">
      {/* Live preview */}
      <div
        className={`relative flex items-center justify-center overflow-hidden p-6 sm:p-10 ${backgroundStyles[background]}`}
        style={background === 'dots' ? { background: dotsBackground } : undefined}
      >
        <div
          className={`relative w-full ${
            framed
              ? 'border-cp-border overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(10,26,77,0.05)]'
              : ''
          }`}
        >
          {children}
        </div>
      </div>

      {/* Toolbar */}
      <div
        className={`border-cp-border flex items-center justify-between gap-3 border-t bg-[#FBFCFE] px-3 py-2.5 ${
          showCode ? '' : 'rounded-b-[16px]'
        }`}
      >
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          aria-expanded={showCode}
          className="border-cp-border text-cp-navy hover:text-cp-blue inline-flex h-[38px] items-center gap-2.5 rounded-[10px] border bg-white px-[15px] font-sans text-[13px] font-bold transition-colors hover:border-[#CFE0FF] hover:bg-[#F4F8FF]"
        >
          <CodeIcon width={16} height={16} />
          <span>{showCode ? 'Hide code' : 'See code'}</span>
          <ChevronDown
            width={15}
            height={15}
            className={`transition-transform duration-200 ${showCode ? 'rotate-180' : ''}`}
          />
        </button>

        {repoGithubUrl && (
          <a
            href={repoGithubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cp-muted hover:text-cp-navy inline-flex items-center gap-2 rounded-[10px] px-3 py-2.5 font-sans text-[13px] font-bold transition-colors hover:bg-[#EEF3FC]"
          >
            <GithubIcon width={17} height={17} />
            <span className="hidden sm:inline">View on GitHub</span>
          </a>
        )}
      </div>

      {/* Code panel */}
      {showCode && activeFile && (
        <div className="overflow-hidden rounded-b-[16px] bg-[#0E1A40]">
          <div className="flex items-center gap-0.5 overflow-x-auto border-t border-[#1E2C5A] bg-[#0A1638] px-2 py-[7px]">
            {allFiles.map((file, index) => {
              const isActive = activeTab === index;
              return (
                <button
                  key={file.filename}
                  type="button"
                  onClick={() => setActiveTab(index)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-[11px] py-[7px] font-mono text-[12px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#1E2C5A] text-white'
                      : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
                  }`}
                >
                  <FrameworkIcon language={file.language} active={isActive} />
                  {file.filename}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-0.5">
              {activeFile.githubUrl && (
                <a
                  href={activeFile.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-[7px] font-sans text-[11.5px] font-semibold text-[#8FA5D9] transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ExternalLink width={14} height={14} />
                  <span className="hidden sm:inline">Open file</span>
                </a>
              )}
              <button
                type="button"
                onClick={copyToClipboard}
                title="Copy code"
                className={`inline-flex items-center rounded-[7px] p-[7px] transition-colors ${
                  copied ? 'text-[#6FE0A0]' : 'text-[#6E82BC] hover:bg-white/5 hover:text-[#B7C6EA]'
                }`}
              >
                {copied ? (
                  <CheckIcon width={15} height={15} strokeWidth={2.6} />
                ) : (
                  <CopyIcon width={15} height={15} />
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {activeFile.highlightedCode ? (
              <pre className="cp-code-pre px-[18px] py-4 font-mono text-[13px] leading-[1.8] text-[#C8D3EA]">
                <code dir="ltr" dangerouslySetInnerHTML={{ __html: activeFile.highlightedCode }} />
              </pre>
            ) : (
              <pre className="px-[18px] py-4 font-mono text-[13px] leading-[1.8] text-[#C8D3EA]">
                <code>{activeFile.code.trim()}</code>
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeExample;
