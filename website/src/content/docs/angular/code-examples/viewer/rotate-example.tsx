'use client'
import { useAngularMount } from '../use-angular-mount'

export const RotateExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/rotate-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
