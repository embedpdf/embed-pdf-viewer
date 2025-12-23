'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const RenderExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/headless/render-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
