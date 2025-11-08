'use client'
import { useSvelteMount } from './use-svelte-mount'

export const PanExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/pan-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
