'use client'

import cn from 'clsx'
import { usePathname } from 'next/navigation'
import type { Heading } from 'nextra'
import { useFSRoute, useHash } from 'nextra/hooks'
import type { Item, MenuItem, PageItem } from 'nextra/normalize-pages'
import type { FC, FocusEventHandler, MouseEventHandler } from 'react'
import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import scrollIntoView from 'scroll-into-view-if-needed'
import { useActiveAnchor, useConfig, useToc } from './stores'
import { Anchor } from './mdx-components/anchor'
import { Button } from './button'
import { ArrowRightIcon } from 'nextra/icons'
import { Collapse } from './collapse'
import { setFocusedRoute, useFocusedRoute } from './stores/focused-route'
import { setMenu, useMenu } from './stores/menu'

const TreeState: Record<string, boolean> = Object.create(null)

const classes = {
  link: cn(
    'flex rounded px-2 py-1.5 text-sm transition-colors [word-break:break-word]',
    'cursor-pointer contrast-more:border',
  ),
  inactive: cn(
    'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
    'dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50', // Dark mode
    'contrast-more:text-gray-900',
    'contrast-more:border-transparent contrast-more:hover:border-gray-900',
  ),
  active: cn(
    'bg-primary-100 font-semibold text-primary-800',
    'dark:bg-primary-400/30 dark:text-primary-200', // Dark mode
    'contrast-more:border-primary-500!',
  ),
  list: cn('grid gap-1'),
  border: cn(
    'relative before:absolute before:inset-y-1',
    'before:w-px before:bg-gray-200 dark:before:bg-gray-800 before:content-[""]', // Dark mode border
    'ps-3 before:start-0 pt-1 ms-3',
  ),
  wrapper: cn('x:p-4 x:overflow-y-auto nextra-scrollbar nextra-mask'),
  footer: cn(
    'nextra-sidebar-footer x:border-t nextra-border x:flex x:items-center x:gap-2 x:py-4 x:mx-4',
  ),
}

type FolderProps = {
  item: PageItem | MenuItem | Item
  anchors: Heading[]
  onFocus: FocusEventHandler
  level: number
}

const Folder: FC<FolderProps> = ({ item: _item, anchors, onFocus, level }) => {
  const routeOriginal = useFSRoute()
  const route = routeOriginal.split('#', 1)[0]!

  const item = {
    ..._item,
    children:
      _item.type === 'menu' ? getMenuChildren(_item as any) : _item.children,
  }

  const hasRoute = !!item.route // for item.type === 'menu' will be ''
  const active = hasRoute && [route, route + '/'].includes(item.route + '/')
  const activeRouteInside =
    active || (hasRoute && route.startsWith(item.route + '/'))

  const focusedRoute = useFocusedRoute()
  const focusedRouteInside = focusedRoute.startsWith(item.route + '/')

  const { theme } = item as Item

  const defaultMenuCollapseLevel = 2
  const autoCollapse = true

  const open =
    TreeState[item.route] === undefined
      ? active ||
        activeRouteInside ||
        focusedRouteInside ||
        (theme && 'collapsed' in theme
          ? !theme.collapsed
          : level < defaultMenuCollapseLevel)
      : TreeState[item.route] || focusedRouteInside

  const [, rerender] = useState<object>()

  const handleClick: MouseEventHandler<
    HTMLAnchorElement | HTMLButtonElement
  > = (event) => {
    const el = event.currentTarget
    const isClickOnIcon =
      el /* will be always <a> or <button> */ !==
      event.target /* can be <svg> or <path> */
    if (isClickOnIcon) {
      event.preventDefault()
    }
    const isOpen = el.parentElement!.classList.contains('open')
    TreeState[item.route] = !isOpen
    rerender({})
  }

  useEffect(() => {
    function updateTreeState() {
      if (activeRouteInside || focusedRouteInside) {
        TreeState[item.route] = true
      }
    }

    function updateAndPruneTreeState() {
      if (activeRouteInside && focusedRouteInside) {
        TreeState[item.route] = true
      } else {
        delete TreeState[item.route]
      }
    }

    if (autoCollapse) {
      updateAndPruneTreeState()
    } else {
      updateTreeState()
    }
  }, [activeRouteInside, focusedRouteInside, item.route, autoCollapse])

  const isLink = 'frontMatter' in item
  // use button when link don't have href because it impacts on SEO
  const ComponentToUse = isLink ? Anchor : Button

  return (
    <li className={cn({ open, active })}>
      <ComponentToUse
        href={isLink ? item.route : undefined}
        data-href={isLink ? undefined : item.route}
        className={cn(
          'items-center justify-between gap-2',
          !isLink && 'w-full text-start',
          classes.link,
          active ? classes.active : classes.inactive,
        )}
        onClick={handleClick}
        onFocus={onFocus}
      >
        {item.title}
        <ArrowRightIcon
          height="18"
          className={cn(
            'shrink-0',
            'rounded-sm p-0.5 hover:bg-gray-800/5 dark:hover:bg-gray-100/10', // Dark mode hover
            'origin-center transition-transform motion-reduce:*:transition-none rtl:-rotate-180',
            open && 'rtl:-rotate-270 ltr:rotate-90',
          )}
        />
      </ComponentToUse>
      {item.children && (
        <Collapse isOpen={open}>
          <Menu
            className={classes.border}
            directories={item.children}
            anchors={anchors}
            level={level}
          />
        </Collapse>
      )}
    </li>
  )
}

function getMenuChildren(menu: MenuItem) {
  const routes = Object.fromEntries(
    (menu.children || []).map((route) => [route.name, route]),
  )
  return Object.entries(menu.items || {}).map(([key, item]) => ({
    ...(routes[key] || { name: key /* for React key prop */ }),
    ...(item as object),
  }))
}

const Separator: FC<{ title: string }> = ({ title }) => {
  return (
    <li
      className={cn(
        '[word-break:break-word]',
        title
          ? 'not-first:mt-5 mb-2 px-2 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100' // Dark mode text
          : 'my-4',
      )}
    >
      {title || (
        <hr className="nextra-border mx-2 border-t dark:border-gray-800" />
      )}
    </li>
  )
}

const handleClick = () => {
  setMenu(false)
}

const File: FC<{
  item: PageItem | Item
  anchors: Heading[]
  onFocus: FocusEventHandler
}> = ({ item, anchors, onFocus }) => {
  const route = useFSRoute()
  // It is possible that the item doesn't have any route - for example, an external link.
  const active = item.route && [route, route + '/'].includes(item.route + '/')
  const activeSlug = useActiveAnchor()

  if (item.type === 'separator') {
    return (
      <Separator title={typeof item.title === 'string' ? item.title : ''} />
    )
  }

  return (
    <li className={cn({ active })}>
      <Anchor
        href={(item as PageItem).href || item.route}
        onClick={handleClick}
        className={cn(classes.link, active ? classes.active : classes.inactive)}
        onFocus={onFocus}
      >
        {item.title}
      </Anchor>
      {active && anchors.length > 0 && (
        <ul className={cn(classes.list, classes.border)}>
          {anchors.map(({ id, value }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={cn(
                  classes.link,
                  'focus-visible:nextra-focus flex gap-2 before:opacity-25 before:content-["#"]',
                  id === activeSlug ? classes.active : classes.inactive,
                )}
                onClick={handleClick}
              >
                {value}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

interface MenuProps {
  directories: PageItem[] | Item[]
  anchors: Heading[]
  className?: string
  level: number
}

const handleFocus: FocusEventHandler<HTMLAnchorElement> = (event) => {
  const route =
    event.target.getAttribute('href') || event.target.dataset.href || ''
  setFocusedRoute(route)
}

const Menu = forwardRef<HTMLUListElement, MenuProps>(
  ({ directories, anchors, className, level }, forwardedRef) => (
    <ul className={cn(classes.list, className)} ref={forwardedRef}>
      {directories.map((item) => {
        const ComponentToUse =
          item.type === 'menu' || item.children?.length ? Folder : File

        return (
          <ComponentToUse
            key={item.name}
            item={item}
            anchors={anchors}
            onFocus={handleFocus}
            level={level + 1}
          />
        )
      })}
    </ul>
  ),
)
Menu.displayName = 'Menu'

interface MobileNavProps {
  showAnchors?: boolean
  route?: string
}

export const MobileNav: FC<MobileNavProps> = ({
  showAnchors = false,
  route,
}) => {
  const { directories } = useConfig().normalizePagesResult
  const toc = useToc()

  const menu = useMenu()
  const pathname = usePathname()
  const hash = useHash()

  const getFilteredDirectories = () => {
    if (!route) return filterOutIndexPages(directories)

    // Find the directory matching the route
    const routeDirectory = directories.find((dir) => dir.route === route)
    if (!routeDirectory) return []

    // If found, return only its children
    return filterOutIndexPages(routeDirectory.children || [])
  }

  // Add recursive filter function
  const filterOutIndexPages = (items: any[]): any[] => {
    return items
      .filter((item) => item.name !== 'index')
      .map((item) => ({
        ...item,
        children: item.children
          ? filterOutIndexPages(item.children)
          : undefined,
      }))
  }

  // Filter the directories
  const filteredDirectories = getFilteredDirectories()

  useEffect(() => {
    //setMenu(false)
  }, [pathname, hash])

  const anchors = toc.filter((v) => v.depth === 2)
  const sidebarRef = useRef<HTMLUListElement>(null!)

  useEffect(() => {
    const sidebar = sidebarRef.current
    const activeLink = sidebar.querySelector('li.active')

    if (activeLink && menu) {
      scrollIntoView(activeLink, {
        block: 'center',
        inline: 'center',
        scrollMode: 'always',
        boundary: sidebar.parentNode as HTMLElement,
      })
    }
  }, [menu])

  return (
    <aside
      className={cn(
        'nextra-mobile-nav',
        'flex flex-col',
        '[contain:layout_style]',
        'md:hidden',
        'bg-white dark:bg-gray-900', // Dark mode background
      )}
    >
      <Menu
        ref={sidebarRef}
        className={classes.wrapper}
        // Use filtered directories instead of original directories
        directories={filteredDirectories}
        anchors={showAnchors ? anchors : []}
        level={0}
      />
    </aside>
  )
}

export const Sidebar: FC<{ toc: Heading[]; floatTOC?: boolean }> = ({
  toc,
  floatTOC = false,
}) => {
  const { normalizePagesResult, hideSidebar } = useConfig()
  const [showToggleAnimation, setToggleAnimation] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const sidebarControlsId = useId()

  const { docsDirectories, activeThemeContext } = normalizePagesResult
  const includePlaceholder = activeThemeContext.layout === 'default'

  useEffect(() => {
    const activeElement = sidebarRef.current?.querySelector('li.active')

    if (activeElement && window.innerWidth > 767) {
      scrollIntoView(activeElement, {
        block: 'center',
        inline: 'center',
        scrollMode: 'always',
        boundary: sidebarRef.current!.parentNode as HTMLDivElement,
      })
    }
  }, [])

  const anchors = floatTOC ? [] : toc.filter((v) => v.depth === 2)

  return (
    <aside
      id={sidebarControlsId}
      className={cn(
        'nextra-sidebar print:hidden',
        'transition-all ease-in-out',
        'flex flex-col max-md:hidden',
        'h-[calc(100dvh-var(--nextra-menu-height))]',
        'top-(--nextra-navbar-height) shrink-0',
        'w-64',
        hideSidebar ? 'hidden' : 'sticky',
      )}
    >
      <div
        className={cn(
          'nextra-scrollbar nextra-mask grow overflow-y-auto p-4',
          !isExpanded && 'no-scrollbar',
        )}
        ref={sidebarRef}
      >
        {/* without !hideSidebar check <Collapse />'s inner.clientWidth on `layout: "raw"` will be 0 and element will not have width on initial loading */}
        {(!hideSidebar || !isExpanded) && (
          <Collapse isOpen={isExpanded} horizontal>
            <Menu
              // The sidebar menu, shows only the docs directories.
              directories={docsDirectories}
              anchors={anchors}
              level={0}
            />
          </Collapse>
        )}
      </div>
    </aside>
  )
}
