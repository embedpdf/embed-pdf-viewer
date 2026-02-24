'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ThemeExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/theme-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
