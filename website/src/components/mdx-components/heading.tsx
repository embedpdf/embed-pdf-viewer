// TODO: check why isn't optimized
'use no memo'

import cn from 'clsx'
import type { ComponentProps, FC } from 'react'
import { HeadingAnchor } from './heading-anchor.client'

const createHeading = (
  Tag: `h${1 | 2 | 3 | 4 | 5 | 6}`,
): FC<ComponentProps<typeof Tag>> =>
  function Heading({ children, id, className, ...props }) {
    const _class = // can be added by footnotes
      className === 'sr-only'
        ? 'sr-only'
        : cn(
            'tracking-tight text-slate-900 dark:text-slate-100',
            Tag === 'h1'
              ? 'font-bold'
              : 'font-semibold target:animate-[fade-in_1.5s]',
            {
              h1: 'mt-2 text-4xl',
              h2: 'mt-10 border-b pb-1 text-3xl nextra-border dark:border-gray-700',
              h3: 'mt-8 text-2xl',
              h4: 'mt-8 text-xl',
              h5: 'mt-8 text-lg',
              h6: 'mt-8 text-base',
            }[Tag],
            className,
          )

    return (
      <Tag id={id} className={_class} {...props}>
        {children}
        {id && <HeadingAnchor id={id} />}
      </Tag>
    )
  }

export const H1 = createHeading('h1')
export const H2 = createHeading('h2')
export const H3 = createHeading('h3')
export const H4 = createHeading('h4')
export const H5 = createHeading('h5')
export const H6 = createHeading('h6')
