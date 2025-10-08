'use client'
import { useVueMount } from './use-vue-mount'

export const AnnotationExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/annotation-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
