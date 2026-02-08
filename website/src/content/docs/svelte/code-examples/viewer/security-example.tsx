'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const SecurityViewerExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/security-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
