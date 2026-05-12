'use client'
import { useAngularMount } from '../use-angular-mount'

export const ThemeExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/theme-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
