'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const DisableCategoriesExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/viewer/disable-categories-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
