'use client'
import { useVueMount } from './use-vue-mount'

export const CommandsExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/commands-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
