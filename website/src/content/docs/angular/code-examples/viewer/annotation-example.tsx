'use client'
import { useAngularMount } from '../use-angular-mount'

export const AnnotationExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/annotation-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
