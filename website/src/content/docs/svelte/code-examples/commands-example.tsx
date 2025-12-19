'use client'
import { useSvelteMount } from './use-svelte-mount'

export const CommandsExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/commands-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
