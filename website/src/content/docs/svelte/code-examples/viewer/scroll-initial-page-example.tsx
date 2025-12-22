'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ScrollInitialPageExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/viewer/scroll-initial-page-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
