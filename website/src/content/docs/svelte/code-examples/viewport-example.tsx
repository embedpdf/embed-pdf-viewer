'use client'
import { useSvelteMount } from './use-svelte-mount'

export const ViewportExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewport-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
