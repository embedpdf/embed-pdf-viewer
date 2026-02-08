'use client'
import { useVueMount } from '../use-vue-mount'

export const RedactionAnnotationExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/redaction-annotation-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
