'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const StampExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/headless/stamp-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
