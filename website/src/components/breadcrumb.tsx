import cn from 'clsx'
// eslint-disable-next-line no-restricted-imports -- since we don't need newWindow prop
import NextLink from 'next/link'
import { ArrowRightIcon } from 'nextra/icons'
import type { Item } from 'nextra/normalize-pages'
import type { FC } from 'react'
import { Fragment } from 'react'

export const Breadcrumb: FC<{
  activePath: Item[]
}> = ({ activePath }) => {
  return (
    <div className="nextra-breadcrumb mt-1.5 flex items-center gap-1 overflow-hidden text-sm text-gray-500 contrast-more:text-current dark:text-gray-400">
      {activePath.map((item, index, arr) => {
        const nextItem = arr[index + 1]

        // Check if this item has an index page
        const hasIndexPage = item.children?.some(
          (child) => child.name === 'index',
        )

        // Determine the href for this breadcrumb item
        let href = ''

        if (hasIndexPage) {
          // If it has an index page, use the item's own route
          href = item.route
        } else if (nextItem) {
          // Otherwise use the original logic for non-index items
          href =
            'frontMatter' in item
              ? item.route
              : // @ts-expect-error -- fixme
                item.children?.[0]?.route === nextItem.route
                ? ''
                : // @ts-expect-error -- fixme
                  item.children?.[0]?.route || ''
        }

        const ComponentToUse = href ? NextLink : 'span'

        return (
          <Fragment key={item.route + item.name}>
            {index > 0 && (
              <ArrowRightIcon height="14" className="shrink-0 rtl:rotate-180" />
            )}
            <ComponentToUse
              className={cn(
                'whitespace-nowrap transition-colors',
                nextItem
                  ? 'min-w-6 overflow-hidden text-ellipsis'
                  : 'font-medium text-gray-700 dark:text-gray-300', // Active item color
                href &&
                  'focus-visible:nextra-focus ring-inset hover:text-gray-900 dark:hover:text-gray-300', // Link hover color
              )}
              title={item.title}
              {...(href && ({ href } as any))}
            >
              {item.title}
            </ComponentToUse>
          </Fragment>
        )
      })}
    </div>
  )
}
