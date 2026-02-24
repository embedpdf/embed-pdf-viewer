'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ZoomExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/zoom-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
