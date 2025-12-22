'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ExportExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/headless/export-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
