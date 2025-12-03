import cn from 'clsx'
// eslint-disable-next-line no-restricted-imports -- since we don't need newWindow prop
import NextLink from 'next/link'
import { ArrowRightIcon } from 'nextra/icons'
import type { FC } from 'react'
import { useConfig } from './stores'

const classes = {
  link: cn(
    'focus-visible:nextra-focus text-gray-600 dark:text-gray-400',
    'hover:text-gray-800 dark:hover:text-gray-200',
    'contrast-more:text-gray-700 contrast-more:dark:text-gray-100',
    'flex max-w-[50%] items-center gap-1 py-4 text-base font-medium transition-colors [word-break:break-word] md:text-lg',
  ),
  icon: cn('inline shrink-0'),
}

export const Pagination: FC = () => {
  const { flatDocsDirectories, activeIndex } = useConfig().normalizePagesResult

  let prev: (typeof flatDocsDirectories)[number] | undefined =
    flatDocsDirectories[activeIndex - 1]
  let next: (typeof flatDocsDirectories)[number] | undefined =
    flatDocsDirectories[activeIndex + 1]

  if (prev && !prev.isUnderCurrentDocsTree) prev = undefined
  if (next && !next.isUnderCurrentDocsTree) next = undefined

  if (!prev && !next) return null

  return (
    <div
      className={cn(
        'nextra-border mb-8 flex items-center border-t pt-8',
        'print:hidden',
      )}
    >
      {prev && (
        <NextLink
          href={prev.route}
          title={typeof prev.title === 'string' ? prev.title : undefined}
          className={cn(classes.link, 'pe-4')}
        >
          <ArrowRightIcon
            height="20"
            className={cn(classes.icon, 'ltr:rotate-180')}
          />
          {prev.title}
        </NextLink>
      )}
      {next && (
        <NextLink
          href={next.route}
          title={typeof next.title === 'string' ? next.title : undefined}
          className={cn(classes.link, 'ms-auto ps-4 text-end')}
        >
          {next.title}
          <ArrowRightIcon
            height="20"
            className={cn(classes.icon, 'rtl:rotate-180')}
          />
        </NextLink>
      )}
    </div>
  )
}
