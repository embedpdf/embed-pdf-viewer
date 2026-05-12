'use client'
import { useAngularMount } from '../use-angular-mount'

export const ScrollExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/scroll-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
