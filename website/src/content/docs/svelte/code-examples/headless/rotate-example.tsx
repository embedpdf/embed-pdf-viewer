'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const RotateExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/headless/rotate-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
