'use client'
import { useAngularMount } from '../use-angular-mount'

export const ZoomExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/zoom-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
