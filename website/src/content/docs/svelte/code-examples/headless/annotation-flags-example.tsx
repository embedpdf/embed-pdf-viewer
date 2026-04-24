'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const AnnotationFlagsExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/annotation-flags-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
