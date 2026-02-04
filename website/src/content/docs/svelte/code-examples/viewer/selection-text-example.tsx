'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const SelectionTextExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/viewer/selection-text-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
