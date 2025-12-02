'use client'

import cn from 'clsx'
import type { MDXWrapper } from 'nextra'
import { useEffect } from 'react'
import { setToc, useConfig } from '../stores'
import { Pagination } from '../pagination'
import { Breadcrumb } from '../breadcrumb'
import NeedHelp from '../need-help'

export const ClientWrapper: MDXWrapper = ({
  toc,
  children,
  metadata,
  bottomContent,
}) => {
  const {
    activeType,
    activeThemeContext: themeContext,
    activePath,
  } = useConfig().normalizePagesResult

  const date = themeContext.timestamp && metadata.timestamp

  // We can't update store in server component so doing it in client component
  useEffect(() => {
    setToc(toc)
  }, [toc])

  return (
    <>
      {activeType === 'page' ? (
        // For page type, render children without article wrapper
        <div className="w-full min-w-0 break-words">{children}</div>
      ) : (
        // For doc type and others, use the article wrapper
        <article
          className={cn(
            'w-full min-w-0 break-words',
            'px-4 pb-8 pt-4 text-slate-700 dark:text-slate-300 md:px-12',
          )}
        >
          {themeContext.breadcrumb && <Breadcrumb activePath={activePath} />}
          {children}
          {date ? (
            <div className="mb-8 mt-12 text-end text-xs text-gray-500 dark:text-gray-400">
              Last updated on{' '}
              {new Date(date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          ) : (
            <div className="x:mt-16" />
          )}
          {themeContext.pagination && <Pagination />}
          <NeedHelp />
        </article>
      )}
    </>
  )
}
