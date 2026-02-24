'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ThumbnailExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/thumbnail-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
