'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const RedactionExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/redaction-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
