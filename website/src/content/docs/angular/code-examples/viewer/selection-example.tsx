'use client'
import { useAngularMount } from '../use-angular-mount'

export const SelectionExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/selection-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
