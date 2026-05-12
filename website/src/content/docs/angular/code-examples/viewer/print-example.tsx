'use client'
import { useAngularMount } from '../use-angular-mount'

export const PrintExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/print-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
