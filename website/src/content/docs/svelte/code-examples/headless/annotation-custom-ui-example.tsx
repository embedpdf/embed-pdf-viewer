'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const CustomUIExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/annotation-custom-ui-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
