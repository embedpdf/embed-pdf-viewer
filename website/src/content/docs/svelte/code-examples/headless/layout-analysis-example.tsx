'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const LayoutAnalysisExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/layout-analysis-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
