'use client'
import { useVueMount } from '../use-vue-mount'

export const AnnotationFlagsExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/annotation-flags-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
