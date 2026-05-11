'use client'
import { useEffect, useRef, useState } from 'react'

export function useAngularMount(loader: () => Promise<{ default: any }>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const angularAppRef = useRef<any>(null)
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
      if (!containerRef.current || angularAppRef.current) return

      try {
        const [mod, angularCore, platformBrowser] = await Promise.all([
          loaderRef.current(),
          import('@angular/core'),
          import('@angular/platform-browser'),
          import('@angular/compiler'),
        ])

        if (!mounted || !containerRef.current) return

        const appRef = await platformBrowser.createApplication({
          providers: [angularCore.provideZonelessChangeDetection()],
        })

        if (!mounted) {
          appRef.destroy()
          return
        }

        appRef.bootstrap(mod.default, containerRef.current)
        angularAppRef.current = appRef
      } catch (error) {
        console.error('Failed to mount Angular component:', error)
      }
    }

    loadAndMount()

    return () => {
      mounted = false
      if (angularAppRef.current) {
        angularAppRef.current.destroy()
        angularAppRef.current = null
      }
      containerRef.current?.replaceChildren()
    }
  }, [isMounted])

  return { containerRef }
}
