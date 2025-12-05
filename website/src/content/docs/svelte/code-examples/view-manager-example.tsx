'use client'
import { useSvelteMount } from './use-svelte-mount'

export const ViewManagerExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/view-manager-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
