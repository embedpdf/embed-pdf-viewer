'use client'
import { useVueMount } from '../use-vue-mount'

export const EngineExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/viewer/engine-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
