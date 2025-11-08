'use client'
import { useSvelteMount } from './use-svelte-mount'

export const SpreadExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/spread-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
