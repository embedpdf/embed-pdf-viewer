'use client'
import { useAngularMount } from '../use-angular-mount'

export const ExportExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/export-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
