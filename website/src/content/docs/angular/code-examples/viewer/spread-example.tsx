'use client'
import { useAngularMount } from '../use-angular-mount'

export const SpreadExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/spread-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
