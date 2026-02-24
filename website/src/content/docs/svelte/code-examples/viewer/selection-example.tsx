'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const SelectionExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/selection-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
