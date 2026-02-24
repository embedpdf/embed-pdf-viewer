'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const DocumentLoadingExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/viewer/document-loading-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
