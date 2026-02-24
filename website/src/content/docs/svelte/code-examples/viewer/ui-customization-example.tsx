'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const UiCustomizationExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/viewer/ui-customization-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
