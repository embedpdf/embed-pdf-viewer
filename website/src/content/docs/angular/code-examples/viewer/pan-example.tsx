'use client'
import { useAngularMount } from '../use-angular-mount'

export const PanExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/pan-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
