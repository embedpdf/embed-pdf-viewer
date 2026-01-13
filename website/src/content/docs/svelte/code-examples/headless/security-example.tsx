'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const SecurityExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/headless/security-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
