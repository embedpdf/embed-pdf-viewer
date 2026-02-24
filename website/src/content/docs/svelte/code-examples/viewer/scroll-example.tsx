'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ScrollExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/scroll-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
