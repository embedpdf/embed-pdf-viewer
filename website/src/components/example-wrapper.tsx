'use client'

import React from 'react'
import { useTheme } from 'next-themes'

interface ExampleWrapperProps {
  children: React.ReactElement<{ themePreference?: 'light' | 'dark' }>
}

/**
 * Wrapper component that passes the website's theme as a prop to examples.
 * This keeps the theme syncing logic out of the example code shown to users.
 *
 * The child component will receive a `themePreference` prop with value 'light' or 'dark'.
 */
export function ExampleWrapper({ children }: ExampleWrapperProps) {
  const { resolvedTheme } = useTheme()
  const themePreference = resolvedTheme === 'dark' ? 'dark' : 'light'

  // Clone the child and pass themePreference as a prop
  return React.cloneElement(children, { themePreference })
}

export default ExampleWrapper
