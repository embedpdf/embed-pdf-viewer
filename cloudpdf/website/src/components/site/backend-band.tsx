'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';

import { MethodBadge } from '@/components/docs/method-badge';
import { ArrowRight } from './icons';

/**
 * The docs landing's closing band.
 *
 * The two rows above it are either/or choices — Viewer *or* Headless,
 * SaaS *or* self-hosted — which is why they are paired cards in the
 * blue/violet tones. The server API is neither: it is the half of
 * *every* path that runs on your backend. So this band is full width,
 * neutral in tone, and labelled as a shared foundation, not a fork.
 *
 * The flow deliberately has no tenant step: on managed CloudPDF the
 * account already is a tenant, and on self-hosted it is one-time setup.
 * Upload → mint → open is the story that is true for everyone — and the
 * third step carrying no method badge is the trust boundary made
 * visible: opening happens in the browser, off this API.
 */

const STEPS = [
  {
    method: 'POST',
    title: 'Upload a document',
    description: 'One call, or resumable presigned uploads.',
    href: '/docs/api-reference/documents/upload',
  },
  {
    method: 'POST',
    title: 'Issue a document token',
    description: 'Short-lived, one document, one user.',
    href: '/docs/api-reference/tokens/issue',
  },
  {
    method: null,
    title: 'Open in your viewer',
    description: 'The token is all the browser ever holds.',
    href: '/docs/engine/getting-started',
  },
];

/**
 * Brand marks for the seven backend SDKs, in the visual language of the
 * framework tiles above (React/Vue/Svelte SVGs, lettermark squares like
 * the Vanilla "JS" tile).
 */
function Lettermark({ bg, text, size = 8.5 }: { bg: string; text: string; size?: number }) {
  return (
    <span
      className="font-display inline-flex h-[19px] w-[19px] items-center justify-center rounded text-white"
      style={{ backgroundColor: bg, fontSize: size, fontWeight: 800, letterSpacing: '-0.02em' }}
    >
      {text}
    </span>
  );
}

function PythonMark() {
  return (
    <svg width={19} height={19} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#3776AB"
        d="M11.9 2C9.6 2 7.8 2.8 7.8 4.9v2h4.4v.9H5.4C3.2 7.8 2 9.5 2 11.9c0 2.4 1.2 4.2 3.4 4.2h1.5v-2.5c0-1.9 1.6-3.4 3.5-3.4h4.3c1.5 0 2.8-1.3 2.8-2.8V4.9C17.5 2.8 15.7 2 13.4 2h-1.5zm-1.5 1.7c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9z"
      />
      <path
        fill="#FFD43B"
        d="M12.1 22c2.3 0 4.1-.8 4.1-2.9v-2h-4.4v-.9h6.8c2.2 0 3.4-1.7 3.4-4.1 0-2.4-1.2-4.2-3.4-4.2h-1.5v2.5c0 1.9-1.6 3.4-3.5 3.4H9.3c-1.5 0-2.8 1.3-2.8 2.8v2.5C6.5 21.2 8.3 22 10.6 22h1.5zm1.5-1.7c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z"
      />
    </svg>
  );
}

function RubyMark() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" aria-hidden>
      <path fill="#CC342D" d="M6.2 3h11.6L22 8.8 12 21 2 8.8 6.2 3z" />
      <path fill="#E05548" d="M12 21 8.5 8.8h7L12 21z" />
      <path fill="#9B1B17" d="M2 8.8h6.5L12 21 2 8.8zM17.8 3 15.5 8.8H22L17.8 3z" />
    </svg>
  );
}

function JavaMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12.6 2.5c1.3 1.5.3 2.9-.8 4-1 1.1-1.6 2.2-.5 3.6"
        stroke="#E76F00"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M5.5 13.5h12.4c.1.5.1 1 .1 1.4 0 3.4-2.8 5.6-6.3 5.6s-6.3-2.2-6.3-5.6c0-.4 0-.9.1-1.4z"
        fill="#5382A1"
      />
      <path
        d="M18.4 15.2c1.4-.4 2.6-.2 2.6.9 0 1.2-1.5 2-3.6 2.3"
        stroke="#5382A1"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const LANGUAGE_MARKS: Record<string, ReactNode> = {
  typescript: <Lettermark bg="#3178C6" text="TS" />,
  python: <PythonMark />,
  php: <Lettermark bg="#777BB4" text="php" size={7} />,
  csharp: <Lettermark bg="#512BD4" text=".NET" size={5.5} />,
  go: <Lettermark bg="#00ADD8" text="GO" size={7.5} />,
  java: <JavaMark />,
  ruby: <RubyMark />,
};

type SdkLanguage = { language: string; label: string };

export function BackendBand({
  languages,
  operationCount,
}: {
  languages: SdkLanguage[];
  operationCount: number;
}) {
  const router = useRouter();

  // The reference documents one page per operation with the language as
  // a synced tab, not a URL variant — so a tile sets the shared
  // preference and navigates; every example downstream is already in
  // that language.
  function chooseLanguage(language: string) {
    const index = languages.findIndex((entry) => entry.language === language);
    if (index >= 0) {
      const value = String(index);
      localStorage.setItem('cloudpdf-sdk-language', value);
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'cloudpdf-sdk-language', newValue: value }),
      );
    }
    router.push('/docs/api-reference');
  }

  return (
    <>
      <div className="mb-[clamp(28px,3.5vw,42px)] mt-[clamp(48px,6vw,80px)] flex justify-center">
        <span className="border-cp-border font-display text-cp-muted inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border bg-[#F1F5FC] px-3.5 py-1.5 text-[12.5px] font-bold tracking-[0.01em]">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#9AA9C7]"
          >
            <path d="M12 2 2 7l10 5 10-5-10-5z" />
            <path d="m2 17 10 5 10-5" />
            <path d="m2 12 10 5 10-5" />
          </svg>
          Both paths share one backend
        </span>
      </div>

      <div className="border-cp-border rounded-[22px] border bg-white p-[clamp(24px,3vw,34px)] shadow-[0_1px_2px_rgba(10,26,77,0.04),0_22px_48px_-32px_rgba(10,26,77,0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <div className="font-display text-cp-navy text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em]">
              Server API
            </div>
            <p className="text-cp-muted mt-2.5 max-w-[62ch] font-sans text-[15px] leading-[1.55]">
              Your backend gets documents in and mints the short-lived tokens your viewer opens
              with. The browser never calls this API.
            </p>
          </div>
          <Link
            href="/docs/api-reference"
            className="text-cp-blue group inline-flex flex-shrink-0 items-center gap-1.5 font-sans text-[14.5px] font-bold no-underline"
          >
            All {operationCount} operations
            <ArrowRight
              width={17}
              height={17}
              strokeWidth={2.4}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        <div className="mt-[22px] flex flex-col items-stretch gap-1.5 min-[760px]:flex-row min-[760px]:items-center">
          {STEPS.map((step, index) => (
            <Fragment key={step.href}>
              {index > 0 ? (
                <span className="flex flex-shrink-0 justify-center text-[#B6C4DF] min-[760px]:px-1">
                  <ArrowRight
                    width={18}
                    height={18}
                    strokeWidth={2.2}
                    className="rotate-90 min-[760px]:rotate-0"
                  />
                </span>
              ) : null}
              <Link
                href={step.href}
                className="border-cp-borderSoft group min-w-0 flex-1 rounded-[14px] border bg-[#FBFCFE] px-4 py-3.5 no-underline transition-all hover:border-[#CFE0FF] hover:bg-white hover:shadow-[0_12px_24px_-16px_rgba(22,119,255,0.45)]"
              >
                <div className="flex items-center gap-2.5">
                  {step.method ? (
                    <MethodBadge method={step.method} />
                  ) : (
                    <span className="border-cp-border text-cp-blue inline-flex w-[38px] shrink-0 items-center justify-center rounded border bg-white py-[3px]">
                      <svg
                        width={9}
                        height={9}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M6 3.5 20 12 6 20.5v-17z" />
                      </svg>
                    </span>
                  )}
                  <span className="text-cp-muted font-mono text-[11px] font-bold">
                    Step {index + 1}
                  </span>
                </div>
                <span className="font-display text-cp-navy group-hover:text-cp-blue mt-2 block text-[15px] font-bold tracking-[-0.01em]">
                  {step.title}
                </span>
                <span className="text-cp-muted mt-0.5 block font-sans text-[13px] leading-[1.45]">
                  {step.description}
                </span>
              </Link>
            </Fragment>
          ))}
        </div>

        <div className="border-cp-borderSoft mt-6 border-t pt-6">
          <div className="flex items-center gap-2.5">
            <span className="text-cp-blue inline-flex flex-shrink-0">
              <svg
                width={17}
                height={17}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m18 16 4-4-4-4" />
                <path d="m6 8-4 4 4 4" />
                <path d="m14.5 4-5 16" />
              </svg>
            </span>
            <span className="font-display text-cp-navy text-sm font-bold tracking-[-0.01em]">
              Use it from your language
            </span>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 min-[880px]:grid-cols-4">
            {languages.map((language) => (
              <button
                key={language.language}
                type="button"
                onClick={() => chooseLanguage(language.language)}
                className="group flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#D7E5FF] bg-[#F2F8FF] px-3 py-3 text-left transition-all hover:border-cp-blue hover:bg-white hover:shadow-[0_12px_24px_-12px_rgba(22,119,255,0.55)]"
              >
                <span className="inline-flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-white shadow-[0_1px_2px_rgba(10,26,77,0.06)]">
                  {LANGUAGE_MARKS[language.language] ?? null}
                </span>
                <span className="font-display text-cp-navy min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.01em]">
                  {language.label}
                </span>
                <ArrowRight
                  width={18}
                  height={18}
                  strokeWidth={2.4}
                  className="text-cp-blue flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
