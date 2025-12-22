'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ScrollExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/headless/scroll-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
