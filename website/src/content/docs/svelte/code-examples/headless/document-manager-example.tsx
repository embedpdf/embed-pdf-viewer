'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const DocumentManagerExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/document-manager-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
