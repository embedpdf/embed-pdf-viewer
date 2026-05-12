'use client'
import { useAngularMount } from '../use-angular-mount'

export const EngineExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/engine-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
