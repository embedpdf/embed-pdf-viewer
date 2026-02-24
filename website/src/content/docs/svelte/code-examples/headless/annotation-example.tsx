'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const AnnotationExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/annotation-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
