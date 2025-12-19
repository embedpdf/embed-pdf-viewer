'use client'

import type { PageMapItem } from 'nextra'
import { normalizePages } from 'nextra/normalize-pages'
import type { FC, ReactElement, ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'

const ConfigContext = createContext<ReturnType<typeof normalizePages> | null>(
  null,
)

export function useConfig() {
  const normalizePagesResult = useContext(ConfigContext)
  if (!normalizePagesResult) {
    throw new Error('Missing ConfigContext.Provider')
  }
  const { activeThemeContext, activeType } = normalizePagesResult
  return {
    normalizePagesResult,
    hideSidebar: !activeThemeContext.sidebar || activeType === 'page',
  }
}

export const ConfigProvider: FC<{
  children: ReactNode
  pageMap: PageMapItem[]
  navbar?: ReactElement
  footer?: ReactElement
}> = ({ children, pageMap, navbar, footer }) => {
  const pathname = usePathname()

  const normalizedPages = normalizePages({
    list: pageMap,
    route: pathname,
  })
  const { activeThemeContext } = normalizedPages

  return (
    <ConfigContext.Provider value={normalizedPages}>
      {activeThemeContext.navbar && <Fragment key="navbar">{navbar}</Fragment>}
      <Fragment key="children">{children}</Fragment>
      {activeThemeContext.footer && <Fragment key="footer">{footer}</Fragment>}
    </ConfigContext.Provider>
  )
}
