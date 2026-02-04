'use client'
import { useEffect, useRef, useState } from 'react'

export function useSvelteMount(loader: () => Promise<{ default: any }>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svelteAppRef = useRef<any>(null)
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
      if (!containerRef.current || svelteAppRef.current) return

      try {
        const [mod, hostMod, svelteRuntime] = await Promise.all([
          loaderRef.current(),
          import('@embedpdf/example-svelte-tailwind/viewer/_example-host'),
          import('svelte'),
        ])
        const { mount, unmount } = svelteRuntime

        if (!mounted) return

        // Svelte 5 uses mount() instead of new Component()
        const app = mount(hostMod.default, {
          target: containerRef.current,
          props: {
            Component: mod.default,
          },
        })
        svelteAppRef.current = { app, unmount }
      } catch (error) {
        console.error('Failed to mount Svelte component:', error)
      }
    }

    loadAndMount()

    return () => {
      mounted = false
      if (svelteAppRef.current) {
        // Svelte 5 uses unmount() instead of $destroy()
        svelteAppRef.current.unmount(svelteAppRef.current.app)
        svelteAppRef.current = null
      }
    }
  }, [isMounted])

  return { containerRef }
}
