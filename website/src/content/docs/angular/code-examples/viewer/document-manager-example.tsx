'use client'
import { useAngularMount } from '../use-angular-mount'

export const DocumentManagerExample = () => {
  const { containerRef } = useAngularMount(
    () =>
      import('@embedpdf/example-angular-tailwind/viewer/document-manager-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
