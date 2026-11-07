import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';

import { CheckIcon } from '../icons';
import { IntegrationCard, StackChip } from '../two-ways';
import { CodeWindow } from './code-window';
import { LiveStage, type LiveOption } from './live-stage';
import { SectionHeading } from './sections';

/*
 * The sections that explain the one choice every visitor makes: the
 * ready-made viewer or the headless library. In order on a page: the two
 * options side by side, what each gives you row by row, both running live,
 * and the path from one to the other. Like the rest of the framework pages,
 * every word comes from the page.
 */

const PAGE_X = 'mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)]';
const SECTION_Y = 'py-[clamp(64px,8vw,110px)]';

type Tone = 'blue' | 'purple';

// ── the two options, side by side ───────────────────────────────────────────

/**
 * One option, in the homepage's own card (two-ways.tsx): the choice looks
 * the same on every page that offers it, and only the words change.
 */
export type Option = {
  badgeIcon: ReactNode;
  badgeLabel: string;
  illustration: string;
  title: string;
  sub: string;
  /** Three short lines, one row each. */
  bullets: string[];
  chips: { icon: ReactNode; label: string; href: string }[];
};

function OptionCard({ option, tone }: { option: Option; tone: Tone }) {
  return (
    <IntegrationCard
      tone={tone}
      badgeIcon={option.badgeIcon}
      badgeLabel={option.badgeLabel}
      illustration={option.illustration}
      title={option.title}
      sub={option.sub}
      bullets={option.bullets}
      chips={option.chips.map((chip) => (
        <StackChip
          key={chip.label}
          accent={tone}
          icon={chip.icon}
          label={chip.label}
          href={chip.href}
        />
      ))}
    />
  );
}

export function OptionCards({
  eyebrow,
  title,
  lead,
  viewer,
  headless,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  viewer: Option;
  headless: Option;
}) {
  return (
    <section className={`bg-white ${SECTION_Y}`}>
      <div className={PAGE_X}>
        <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
        <div className="relative mt-14 grid items-stretch gap-6 min-[1101px]:grid-cols-2">
          <div
            aria-hidden
            className="font-display text-ep-navy pointer-events-none absolute left-1/2 top-1/2 z-[2] inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(7,32,76,0.10)] bg-white text-[13px] font-extrabold tracking-[0.06em] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_4px_14px_rgba(7,32,76,0.08),0_12px_28px_-10px_rgba(8,118,253,0.18)]"
          >
            OR
          </div>
          <OptionCard option={viewer} tone="blue" />
          <OptionCard option={headless} tone="purple" />
        </div>
      </div>
    </section>
  );
}

// ── the two options, row by row ─────────────────────────────────────────────

/**
 * How a cell reads: `yes` it's there, `partial` within limits, `custom` it's
 * yours to build or decide (the headless column's usual answer, and not a
 * shortcoming, so it gets the brand purple rather than a warning color).
 */
export type Verdict = 'yes' | 'partial' | 'custom';
export type OptionRow = {
  topic: string;
  viewer: [Verdict, ReactNode];
  headless: [Verdict, ReactNode];
};

function VerdictMark({ verdict }: { verdict: Verdict }) {
  if (verdict === 'yes') {
    return (
      <span className="inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-[rgba(34,197,94,0.14)] text-[#16A34A]">
        <CheckIcon size={12} strokeWidth={3} />
      </span>
    );
  }
  if (verdict === 'partial') {
    return (
      <span className="inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-[rgba(245,158,11,0.16)] text-[#D97706]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 12h12" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="text-ep-purple inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-[rgba(151,71,255,0.14)]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function VerdictCell({ value }: { value: [Verdict, ReactNode] }) {
  return (
    <span className="flex items-start gap-2.5">
      <VerdictMark verdict={value[0]} />
      <span className="pt-px [&_code]:whitespace-nowrap [&_code]:text-[0.9em] [&_code]:text-[#0758B8]">
        {value[1]}
      </span>
    </span>
  );
}

export function OptionCompare({
  eyebrow,
  title,
  body,
  link,
  viewerLabel,
  headlessLabel,
  rows,
}: {
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  link?: ReactNode;
  viewerLabel: string;
  headlessLabel: string;
  rows: OptionRow[];
}) {
  return (
    <section className={`bg-ep-bg ${SECTION_Y}`}>
      <div
        className={`${PAGE_X} grid items-start gap-[clamp(36px,5vw,80px)] min-[1101px]:grid-cols-[minmax(280px,380px)_1fr]`}
      >
        <div className="flex flex-col items-start">
          <SectionHeading eyebrow={eyebrow} title={title} align="left" />
          <div className="text-ep-muted mt-6 flex max-w-[400px] flex-col gap-4 font-sans text-[16.5px] leading-[1.6] [&_p]:m-0">
            {body}
          </div>
          {link && <div className="mt-7">{link}</div>}
        </div>
        <div className="border-ep-border overflow-x-auto rounded-2xl border bg-white shadow-[0_12px_32px_-18px_rgba(7,32,76,0.14)]">
          <table className="w-full min-w-[620px] border-collapse text-left font-sans text-[14.5px] leading-[1.5]">
            <thead>
              <tr className="border-ep-border border-b bg-[#F7F9FE]">
                <th className="font-display text-ep-subtle w-[24%] px-5 py-4 text-xs font-bold uppercase tracking-[0.08em]">
                  Capability
                </th>
                <th className="font-display text-ep-navy w-[38%] px-5 py-4 text-[15px] font-extrabold">
                  <span className="inline-flex items-center gap-2">
                    <span className="bg-ep-blue h-2.5 w-2.5 rounded-full" />
                    {viewerLabel}
                  </span>
                </th>
                <th className="font-display text-ep-navy w-[38%] px-5 py-4 text-[15px] font-extrabold">
                  <span className="inline-flex items-center gap-2">
                    <span className="bg-ep-purple h-2.5 w-2.5 rounded-full" />
                    {headlessLabel}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.topic} className="border-ep-border border-b last:border-b-0">
                  <th className="font-display text-ep-navy px-5 py-4 align-top text-[14.5px] font-bold">
                    {row.topic}
                  </th>
                  <td className="text-ep-ink px-5 py-4 align-top">
                    <VerdictCell value={row.viewer} />
                  </td>
                  <td className="text-ep-ink px-5 py-4 align-top">
                    <VerdictCell value={row.headless} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── both options, live ──────────────────────────────────────────────────────

export type LiveDemo = {
  id: string;
  label: string;
  tone: 'blue' | 'purple';
  /** The demo's source file, relative to the site root: shown as the code, and it's what runs. */
  source: string;
  /** The file name the code panel shows. */
  filename: string;
  /** The running demo: a lazy client component (live/lazy.tsx). */
  preview: ReactNode;
  caption: ReactNode;
};

/**
 * Both options running side by side with their code. The code panel shows
 * the demo's own source file, read at build time, so what a visitor reads is
 * exactly what runs next to it, and the line count in the switch is honest.
 */
export function LiveCompare({
  eyebrow,
  title,
  lead,
  demos,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  demos: LiveDemo[];
}) {
  const options: LiveOption[] = demos.map((demo) => {
    const code = readFileSync(path.join(process.cwd(), demo.source), 'utf8').trim();
    return {
      id: demo.id,
      label: demo.label,
      tone: demo.tone,
      meta: `${code.split('\n').length} lines`,
      code: <CodeWindow file={{ filename: demo.filename, language: 'tsx', code }} fill />,
      preview: demo.preview,
      caption: demo.caption,
    };
  });

  return (
    <section className={`bg-white ${SECTION_Y}`}>
      <div className={PAGE_X}>
        <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
        <div className="mt-10">
          <LiveStage options={options} />
        </div>
      </div>
    </section>
  );
}

// ── the path from one option to the other ───────────────────────────────────

export function PathSteps({
  eyebrow,
  title,
  body,
  action,
  steps,
}: {
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  steps: { title: string; body: ReactNode; tone?: Tone }[];
}) {
  return (
    <section className={`bg-ep-bg ${SECTION_Y}`}>
      <div
        className={`${PAGE_X} grid items-center gap-[clamp(40px,5vw,88px)] min-[1101px]:grid-cols-[minmax(280px,400px)_1fr]`}
      >
        <div className="flex flex-col items-start">
          <SectionHeading eyebrow={eyebrow} title={title} align="left" />
          <div className="text-ep-muted mt-6 max-w-[400px] font-sans text-[16.5px] leading-[1.6] [&_p]:m-0">
            {body}
          </div>
          {action && <div className="mt-8">{action}</div>}
        </div>
        <ol className="relative m-0 grid list-none gap-8 p-0 min-[761px]:grid-cols-3 min-[761px]:gap-6">
          {/* The line the steps sit on: blue into purple, like the choice itself. */}
          <span
            aria-hidden
            className="from-ep-blue to-ep-purple absolute left-[22px] right-[22px] top-[22px] hidden h-[2px] bg-gradient-to-r opacity-30 min-[761px]:block"
          />
          {steps.map((step, i) => {
            const purple = step.tone === 'purple';
            return (
              <li key={step.title} className="relative flex gap-4 min-[761px]:flex-col">
                <span
                  className={`font-display relative z-[1] inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 bg-white text-base font-extrabold ${
                    purple ? 'border-ep-purple text-ep-purple' : 'border-ep-blue text-ep-blue'
                  } shadow-[0_0_0_6px_#FBFCFE]`}
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-ep-navy m-0 mb-2 text-[18px] font-extrabold leading-[1.3] tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <div className="text-ep-muted font-sans text-[15px] leading-[1.6] [&_code]:text-[0.9em] [&_code]:text-[#0758B8] [&_p]:m-0">
                    {step.body}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
