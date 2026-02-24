'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const ViewerExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/viewer-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
