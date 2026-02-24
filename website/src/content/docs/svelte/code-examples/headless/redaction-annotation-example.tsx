'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const RedactionAnnotationExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/redaction-annotation-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
