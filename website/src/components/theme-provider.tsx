'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'

const THEME_COLORS = {
  light: '#ffffff',
  dark: '#030712', // gray-950
}

function ThemeColorMeta() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Render nothing on server, fallback handled by layout.tsx metadata
  if (!mounted) return null

  const color =
    resolvedTheme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light

  // Next.js App Router automatically hoists <meta> tags to <head>
  return <meta name="theme-color" content={color} />
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeColorMeta />
      {children}
    </NextThemesProvider>
  )
}
