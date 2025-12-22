'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const SimpleZoomExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/simple-zoom-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
