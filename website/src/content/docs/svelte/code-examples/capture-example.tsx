'use client'
import { useSvelteMount } from './use-svelte-mount'

export const CaptureExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/capture-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
