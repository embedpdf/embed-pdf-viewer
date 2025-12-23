import cn from 'clsx'
import NextLink from 'next/link'
import type { FC, HTMLAttributes, ReactElement, ReactNode } from 'react'

const Card: FC<{
  title: string
  description?: string
  icon?: ReactElement
  arrow?: boolean
  href: string
  children?: ReactNode
  /** CSS class name. */
  className?: string
}> = ({
  children,
  title,
  description,
  icon,
  arrow,
  href,
  className,
  ...props
}) => {
  return (
    <NextLink
      href={href}
      className={cn(
        'group',
        'focus-visible:nextra-focus nextra-card flex flex-col justify-start overflow-hidden rounded-lg border border-gray-200',
        'text-current no-underline dark:shadow-none',
        'shadow-gray-100 hover:shadow-gray-100 dark:hover:shadow-none',
        'active:shadow-sm active:shadow-gray-200',
        'transition-all duration-200 hover:border-gray-300',
        children
          ? 'bg-gray-100 shadow hover:shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-50 dark:hover:border-neutral-500 dark:hover:bg-neutral-700'
          : 'bg-transparent shadow-sm hover:bg-slate-50 hover:shadow-md dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900',
        className,
      )}
      {...props}
    >
      {children}
      <span
        className={cn(
          'flex flex-col gap-1 p-4',
          arrow && [
            'after:transition-transform after:duration-75 after:content-["→"]',
            'group-hover:after:translate-x-0.5',
            'group-focus:after:translate-x-0.5',
          ],
          children
            ? 'dark:text-gray-300 dark:hover:text-gray-100'
            : 'dark:text-neutral-200 dark:hover:text-neutral-50',
        )}
      >
        <span
          className={cn(
            'flex items-center gap-2 font-semibold text-gray-700 hover:text-gray-900',
            children
              ? 'dark:text-gray-300 dark:hover:text-gray-100'
              : 'dark:text-neutral-200 dark:hover:text-neutral-50',
          )}
          title={typeof title === 'string' ? title : undefined}
        >
          {icon}
          <span className="truncate">{title}</span>
        </span>
        {description && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {description}
          </span>
        )}
      </span>
    </NextLink>
  )
}

const _Cards: FC<
  {
    /**
     * Number of columns.
     * @default 3
     */
    num?: number
  } & HTMLAttributes<HTMLDivElement>
> = ({ children, num = 3, className, style, ...props }) => {
  return (
    <div
      className={cn(
        'nextra-cards mt-4 grid gap-4',
        'not-prose', // for nextra-theme-blog
        className,
      )}
      {...props}
      style={{
        ...style,
        ['--rows' as string]: num,
      }}
    >
      {children}
    </div>
  )
}

/**
 * A built-in component that allows you to display content in a visually appealing card format. It
 * includes options for adding an icon, title, link and an image to related content.
 *
 * @example
 * ### Grouped cards
 *
 * <Cards>
 *   <Cards.Card
 *     icon={<WarningIcon />}
 *     title="Callout"
 *     href="/docs/built-ins/callout"
 *   />
 *   <Cards.Card
 *     icon={<CardsIcon />}
 *     title="Tabs"
 *     href="/docs/built-ins/tabs"
 *   />
 *   <Cards.Card
 *     icon={<OneIcon />}
 *     title="Steps"
 *     href="/docs/built-ins/steps"
 *   />
 * </Cards>
 *
 * ### Single card
 *
 * <br />
 * <Cards.Card
 *   icon={<BoxIcon />}
 *   title="About Nextra"
 *   href="/about"
 *   arrow
 * />
 *
 * @usage
 * ### Grouped cards
 *
 * Import the `<Cards>` component to your page, which includes the `<Card>` component.
 *
 * Then, optionally import the icons that you want to use. To create a set of cards, follow the
 * example below where the `<Cards.Card>` component is used to create a card and the `<Cards>`
 * component is used to group multiple cards together.
 *
 * ```mdx filename="MDX"
 * import { Cards } from 'nextra/components'
 * import { CardsIcon, OneIcon, WarningIcon } from '../path/with/your/icons'
 *
 * <Cards>
 *   <Cards.Card
 *     icon={<WarningIcon />}
 *     title="Callout"
 *     href="/docs/built-ins/callout"
 *   />
 *   <Cards.Card
 *     icon={<CardsIcon />}
 *     title="Tabs"
 *     href="/docs/built-ins/tabs"
 *   />
 *   <Cards.Card
 *     icon={<OneIcon />}
 *     title="Steps"
 *     href="/docs/built-ins/steps"
 *   />
 * </Cards>
 * ```
 *
 * ### Single card
 *
 * A `<Card>` not wrapped in a `<Cards>` component will not be grouped with other cards. This can
 * be useful if you want to display a single card in a different format than the other cards on the
 * page.
 *
 * ```mdx filename="MDX"
 * <Cards.Card
 *   icon={<BoxIcon />}
 *   title="About Nextra"
 *   href="/about"
 *   arrow
 * />
 * ```
 */
export const Cards = Object.assign(_Cards, { displayName: 'Cards', Card })
