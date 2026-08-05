import Link from 'next/link';
import type { ReactNode } from 'react';

import { LegalTableOfContents } from './legal-table-of-contents';

export type LegalSection = Readonly<{
  id: string;
  title: string;
  content: ReactNode;
}>;

type LegalPageProps = Readonly<{
  description: string;
  eyebrow: string;
  lastUpdated: string;
  sections: readonly LegalSection[];
  title: string;
}>;

export function LegalPage({ description, eyebrow, lastUpdated, sections, title }: LegalPageProps) {
  return (
    <main className="bg-cp-bg min-h-screen">
      <section className="relative overflow-hidden border-b border-[#E4EAF4] bg-white">
        <div className="cp-dots pointer-events-none absolute -right-10 -top-8 h-44 w-56 text-[#D9E7FF]" />
        <div className="relative mx-auto w-full max-w-[1180px] px-[clamp(20px,4vw,64px)] py-[clamp(64px,8vw,104px)]">
          <p className="font-display text-cp-blue text-sm font-extrabold uppercase tracking-[0.16em]">
            {eyebrow}
          </p>
          <h1 className="font-display text-cp-navy mt-4 max-w-[850px] text-[clamp(40px,6vw,68px)] font-extrabold leading-[1.04] tracking-[-0.035em]">
            {title}
          </h1>
          <p className="text-cp-ink mt-6 max-w-[760px] text-[clamp(17px,2vw,20px)] leading-[1.7]">
            {description}
          </p>
          <p className="text-cp-muted mt-8 text-sm font-semibold">Last updated {lastUpdated}</p>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[clamp(20px,4vw,64px)] py-[clamp(56px,7vw,88px)] min-[960px]:grid-cols-[240px_minmax(0,1fr)] min-[960px]:gap-16">
        <aside className="min-w-0">
          <LegalTableOfContents
            title={title}
            sections={sections.map(({ id, title: sectionTitle }) => ({
              id,
              title: sectionTitle,
            }))}
          />
        </aside>

        <article className="min-w-0">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className={`scroll-mt-32 ${index === 0 ? '' : 'border-cp-border mt-14 border-t pt-14'}`}
            >
              <p className="text-cp-blue font-display text-sm font-extrabold tracking-[0.08em]">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="font-display text-cp-navy mt-2 text-[clamp(26px,3vw,34px)] font-extrabold leading-tight tracking-[-0.02em]">
                {section.title}
              </h2>
              <div className="mt-6 space-y-5">{section.content}</div>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return <p className="text-cp-ink text-[16px] leading-[1.78]">{children}</p>;
}

export function LegalSubheading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-cp-navy pt-3 text-xl font-extrabold tracking-[-0.01em]">
      {children}
    </h3>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return (
    <ul className="text-cp-ink marker:text-cp-blue ml-5 list-disc space-y-2.5 text-[16px] leading-[1.72]">
      {children}
    </ul>
  );
}

export function LegalCallout({ children }: { children: ReactNode }) {
  return (
    <div className="border-cp-blue/20 bg-cp-surface text-cp-navy rounded-xl border p-5 text-[15px] font-medium leading-[1.7]">
      {children}
    </div>
  );
}

export function LegalLink({ children, href }: { children: ReactNode; href: string }) {
  const external = href.startsWith('http');

  return (
    <Link
      href={href}
      className="text-cp-blue hover:text-cp-blue700 font-semibold underline decoration-[#9FC8FF] underline-offset-4 transition-colors"
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </Link>
  );
}

export function LegalTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="border-cp-border overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <thead className="bg-cp-surface">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="font-display text-cp-navy border-cp-border border-b px-4 py-3 text-sm font-extrabold"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="text-cp-ink border-cp-border border-b px-4 py-4 text-[14px] leading-[1.65] last:[tr:last-child_&]:border-b-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
