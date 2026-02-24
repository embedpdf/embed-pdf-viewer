'use client'

import {
  Tab as HeadlessTab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from '@headlessui/react'
import type {
  TabProps as HeadlessTabProps,
  TabGroupProps,
  TabListProps,
  TabPanelProps,
} from '@headlessui/react'
import cn from 'clsx'
import type { FC, ReactElement, ReactNode } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useHash } from 'nextra/hooks'

type TabItem = string | ReactElement

type TabObjectItem = {
  label: TabItem
  disabled: boolean
}

function isTabObjectItem(item: unknown): item is TabObjectItem {
  return !!item && typeof item === 'object' && 'label' in item
}

export const Tabs: FC<
  {
    items: (TabItem | TabObjectItem)[]
    children: ReactNode
    storageKey?: string
    className?: TabListProps['className']
    tabClassName?: HeadlessTabProps['className']
  } & Pick<TabGroupProps, 'defaultIndex' | 'selectedIndex' | 'onChange'>
> = ({
  items,
  children,
  storageKey,
  defaultIndex = 0,
  selectedIndex: _selectedIndex,
  onChange,
  className,
  tabClassName,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex)
  const hash = useHash()
  const tabPanelsRef = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    if (_selectedIndex !== undefined) {
      setSelectedIndex(_selectedIndex)
    }
  }, [_selectedIndex])

  useEffect(() => {
    if (!hash) return
    const tabPanel = tabPanelsRef.current.querySelector(
      `[role=tabpanel]:has([id="${hash}"])`,
    )
    if (!tabPanel) return

    for (const [index, el] of Object.entries(tabPanelsRef.current.children)) {
      if (el === tabPanel) {
        setSelectedIndex(Number(index))
        // Clear hash first, otherwise page isn't scrolled
        location.hash = ''
        // Execute on next tick after `selectedIndex` update
        requestAnimationFrame(() => {
          location.hash = `#${hash}`
        })
      }
    }
  }, [hash])

  useEffect(() => {
    if (!storageKey) {
      // Do not listen storage events if there is no storage key
      return
    }

    function fn(event: StorageEvent) {
      if (event.key === storageKey) {
        setSelectedIndex(Number(event.newValue))
      }
    }

    const index = Number(localStorage.getItem(storageKey))
    setSelectedIndex(Number.isNaN(index) ? 0 : index)

    window.addEventListener('storage', fn)
    return () => {
      window.removeEventListener('storage', fn)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  const handleChange = (index: number) => {
    if (storageKey) {
      const newValue = String(index)
      localStorage.setItem(storageKey, newValue)

      // the storage event only get picked up (by the listener) if the localStorage was changed in
      // another browser's tab/window (of the same app), but not within the context of the current tab.
      window.dispatchEvent(
        new StorageEvent('storage', { key: storageKey, newValue }),
      )
      return
    }
    setSelectedIndex(index)
    onChange?.(index)
  }

  return (
    <TabGroup
      selectedIndex={selectedIndex}
      defaultIndex={defaultIndex}
      onChange={handleChange}
      as={Fragment}
    >
      <TabList
        className={(args) =>
          cn(
            'nextra-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain',
            'mt-4 flex w-full gap-2 border-b border-gray-200 pb-px dark:border-gray-800',
            'focus-visible:nextra-focus',
            typeof className === 'function' ? className(args) : className,
          )
        }
      >
        {items.map((item, index) => (
          <HeadlessTab
            key={index}
            disabled={isTabObjectItem(item) && item.disabled}
            className={(args) => {
              const { selected, disabled, hover, focus } = args
              return cn(
                focus && 'nextra-focus ring-inset',
                'cursor-pointer whitespace-nowrap',
                'rounded-t p-2 font-medium leading-5 transition-colors',
                '-mb-0.5 select-none border-b-2',
                selected
                  ? 'border-current outline-none'
                  : hover
                    ? 'border-gray-200 dark:border-gray-800'
                    : 'border-transparent',
                selected
                  ? 'text-primary-600 dark:text-primary-400'
                  : disabled
                    ? 'pointer-events-none text-gray-400 dark:text-gray-600'
                    : hover
                      ? 'text-black dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400',
                typeof tabClassName === 'function'
                  ? tabClassName(args)
                  : tabClassName,
              )
            }}
          >
            {isTabObjectItem(item) ? item.label : item}
          </HeadlessTab>
        ))}
      </TabList>
      <TabPanels ref={tabPanelsRef}>{children}</TabPanels>
    </TabGroup>
  )
}

export const Tab: FC<TabPanelProps> = ({
  children,
  // For SEO display all the Panel in the DOM and set `display: none;` for those that are not selected
  unmount = false,
  className,
  ...props
}) => {
  return (
    <TabPanel
      {...props}
      unmount={unmount}
      className={(args) =>
        cn(
          'mt-6 rounded',
          args.focus && 'nextra-focus',
          typeof className === 'function' ? className(args) : className,
        )
      }
    >
      {children}
    </TabPanel>
  )
}
