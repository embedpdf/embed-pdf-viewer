import type { HTMLAttributes } from 'react';

/**
 * Docs heading styles live here (not in mdx.tsx) because components rendered
 * *inside* MDX — the API reference, most of all — emit their own headings as
 * JSX. MDX component overrides only reach markdown-authored elements, so a
 * component's own <h2> would otherwise fall back to Tailwind's preflight and
 * render at body size with no margin.
 */
export const HEADING_STYLES = {
  h2: 'mt-[52px] font-display text-[27px] font-extrabold leading-[1.2] tracking-[-0.02em] text-cp-navy',
  h3: 'mt-[34px] font-display text-[18px] font-extrabold leading-[1.3] tracking-[-0.01em] text-cp-navy',
  h4: 'mt-7 font-display text-base font-extrabold text-cp-navy',
} as const;

type HeadingTag = keyof typeof HEADING_STYLES;

type HeadingProps = HTMLAttributes<HTMLHeadingElement> & { as?: HeadingTag };

export function Heading({ as = 'h2', id, children, className = '', ...props }: HeadingProps) {
  const Tag = as;
  return (
    <Tag id={id} className={`group scroll-mt-[100px] ${HEADING_STYLES[as]} ${className}`} {...props}>
      {children}
      {id ? (
        <a
          href={`#${id}`}
          aria-label="Link to this section"
          className="hover:text-cp-blue ml-2 select-none text-[#C2CEE6] opacity-0 transition group-hover:opacity-100"
        >
          #
        </a>
      ) : null}
    </Tag>
  );
}

export function createHeading(as: HeadingTag) {
  return function MdxHeading(props: HTMLAttributes<HTMLHeadingElement>) {
    return <Heading as={as} {...props} />;
  };
}
