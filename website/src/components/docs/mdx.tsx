import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { DocsPage } from './docs-page';
import { Example } from './example';
import { Fw } from './framework';
import { createHeading } from './heading';
import { Pre } from './pre';
import type { TocItem } from './toc';

import { CodeExample } from '@/components/site/code-example';

type WrapperProps = {
  children: ReactNode;
  toc?: TocItem[];
  metadata?: { title?: string; description?: string };
};

function Wrapper({ children, toc }: WrapperProps) {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local';
  return (
    <DocsPage toc={toc} revision={revision}>
      {children}
    </DocsPage>
  );
}

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    wrapper: Wrapper,
    h1: (props) => (
      <h1
        className="font-display text-ep-navy scroll-mt-[100px] text-[clamp(34px,4vw,46px)] font-extrabold leading-[1.08] tracking-[-0.025em]"
        {...props}
      />
    ),
    h2: createHeading('h2'),
    h3: createHeading('h3'),
    h4: createHeading('h4'),
    p: (props) => (
      <p
        className="text-ep-ink mt-4 max-w-[70ch] font-sans text-[16.5px] leading-[1.7]"
        {...props}
      />
    ),
    a: ({ href = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <Link
        href={href}
        className="text-ep-blue font-semibold underline-offset-[3px] hover:underline"
        {...props}
      />
    ),
    strong: (props) => <strong className="text-ep-navy font-bold" {...props} />,
    ul: (props) => (
      <ul
        className="text-ep-ink marker:text-ep-blue mt-4 max-w-[70ch] list-disc space-y-2.5 pl-6 font-sans text-base leading-[1.55]"
        {...props}
      />
    ),
    ol: (props) => (
      <ol
        className="text-ep-ink marker:text-ep-blue mt-4 max-w-[70ch] list-decimal space-y-2.5 pl-6 font-sans text-base leading-[1.55] marker:font-semibold"
        {...props}
      />
    ),
    li: (props) => <li className="pl-1 leading-[1.55]" {...props} />,
    blockquote: (props) => (
      <blockquote
        className="mt-6 max-w-[72ch] rounded-[14px] border border-[#C9DEFF] bg-[#F2F7FF] px-[18px] py-4 font-sans text-[15px] leading-[1.6] text-[#2A4574] [&>p]:mt-0 [&>p]:max-w-none [&>p]:text-inherit"
        {...props}
      />
    ),
    hr: (props) => <hr className="border-ep-border my-10" {...props} />,
    table: (props) => (
      <div className="mt-6 max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...props} />
      </div>
    ),
    th: (props) => (
      <th
        className="border-ep-border font-display text-ep-navy border-b px-3 py-2 text-left font-bold"
        {...props}
      />
    ),
    td: (props) => (
      <td className="border-ep-borderSoft text-ep-ink border-b px-3 py-2" {...props} />
    ),
    pre: Pre,
    CodeExample,
    Example,
    Fw,
    ...components,
  };
}
