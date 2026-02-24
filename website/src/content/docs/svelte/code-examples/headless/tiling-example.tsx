'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const TilingExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/headless/tiling-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
