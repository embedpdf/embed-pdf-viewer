'use client'
import { useSvelteMount } from './use-svelte-mount'

export const PrintExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/print-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
