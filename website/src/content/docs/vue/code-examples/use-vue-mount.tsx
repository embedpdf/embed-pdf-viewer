'use client'
import { useEffect, useRef, useState } from 'react'

export function useVueMount(loader: () => Promise<{ default: any }>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const vueAppRef = useRef<any>(null)
  const loaderRef = useRef(loader)
  const [isMounted, setIsMounted] = useState(false)

  // Keep latest loader without triggering unmount/remount on rerenders
  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  // Ensure we only render on client
  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return

    let mounted = true

    const loadAndMount = async () => {
      if (!containerRef.current || vueAppRef.current) return

      try {
        const [mod, hostMod, vue] = await Promise.all([
          loaderRef.current(),
          import('@embedpdf/example-vue-tailwind/viewer/_example-host'),
          import('vue'),
        ])
        const { createApp, h } = vue

        if (!mounted) return

        // Create app with host component, passing the actual component as a prop
        const app = createApp({
          render: () => h(hostMod.default, { component: mod.default }),
        })
        app.mount(containerRef.current)
        vueAppRef.current = app
      } catch (error) {
        console.error('Failed to mount Vue component:', error)
      }
    }

    loadAndMount()

    return () => {
      mounted = false
      if (vueAppRef.current) {
        vueAppRef.current.unmount()
        vueAppRef.current = null
      }
    }
  }, [isMounted])

  return { containerRef }
}
