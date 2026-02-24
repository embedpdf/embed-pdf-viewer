'use client'
import { useVueMount } from '../use-vue-mount'

export const LayoutAnalysisExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/layout-analysis-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
