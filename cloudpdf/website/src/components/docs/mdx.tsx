import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { EngineCrossLink } from '@embedpdf/docs-kit';

import { CodeExample } from '@/components/site/code-example';

import {
  ApiCredentials,
  ApiGrants,
  ApiInstall,
  ApiOperationCount,
  ApiResources,
} from './api-overview';
import { ApiClientSetup, ApiOperation, ApiSnippet } from './api-reference';
import { DeploymentTab, DeploymentTabs } from './deployment-tabs';
import { Fw } from './framework';
import { createHeading } from './heading';
import { Pre } from './pre';
import { Toc, type TocItem } from './toc';

type WrapperProps = {
  children: ReactNode;
  toc?: TocItem[];
  metadata?: { title?: string; description?: string };
};

function Wrapper({ children, toc }: WrapperProps) {
  return (
    <div className="flex gap-[clamp(28px,4vw,60px)]">
      <article className="prose-cloudpdf min-w-0 flex-1 pb-20 pt-9">{children}</article>
      <Toc toc={toc} />
    </div>
  );
}

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    wrapper: Wrapper,
    h1: (props) => (
      <h1
        className="font-display text-cp-navy scroll-mt-[100px] text-[clamp(34px,4vw,46px)] font-extrabold leading-[1.08] tracking-[-0.025em]"
        {...props}
      />
    ),
    h2: createHeading('h2'),
    h3: createHeading('h3'),
    h4: createHeading('h4'),
    p: (props) => (
      <p
        className="text-cp-ink mt-4 max-w-[70ch] font-sans text-[16.5px] leading-[1.7]"
        {...props}
      />
    ),
    a: ({ href = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <Link
        href={href}
        className="text-cp-blue font-semibold underline-offset-[3px] hover:underline"
        {...props}
      />
    ),
    strong: (props) => <strong className="text-cp-navy font-bold" {...props} />,
    ul: (props) => (
      <ul
        className="text-cp-ink marker:text-cp-blue mt-4 max-w-[70ch] list-disc space-y-2.5 pl-6 font-sans text-base leading-[1.55]"
        {...props}
      />
    ),
    ol: (props) => (
      <ol
        className="text-cp-ink marker:text-cp-blue mt-4 max-w-[70ch] list-decimal space-y-2.5 pl-6 font-sans text-base leading-[1.55] marker:font-semibold"
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
    hr: (props) => <hr className="border-cp-border my-10" {...props} />,
    table: (props) => (
      <div className="mt-6 max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...props} />
      </div>
    ),
    th: (props) => (
      <th
        className="border-cp-border font-display text-cp-navy border-b px-3 py-2 text-left font-bold"
        {...props}
      />
    ),
    td: (props) => (
      <td className="border-cp-borderSoft text-cp-ink border-b px-3 py-2" {...props} />
    ),
    pre: Pre,
    ApiOperation,
    EngineCrossLink,
    Fw,
    ApiSnippet,
    ApiClientSetup,
    ApiResources,
    ApiCredentials,
    ApiGrants,
    ApiInstall,
    ApiOperationCount,
    DeploymentTabs,
    DeploymentTab,
    CodeExample,
    ...components,
  };
}
