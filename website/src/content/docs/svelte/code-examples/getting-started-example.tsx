'use client'
import { useSvelteMount } from './use-svelte-mount'

export const GettingStartedExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/getting-started'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
