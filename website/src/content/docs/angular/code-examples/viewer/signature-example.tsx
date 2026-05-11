'use client'
import { useAngularMount } from '../use-angular-mount'

export const SignatureExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/signature-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
