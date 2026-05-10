'use client'
import { useAngularMount } from '../use-angular-mount'

export const ViewerExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/viewer-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
