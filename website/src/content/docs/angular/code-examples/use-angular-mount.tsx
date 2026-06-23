'use client'
import type { ApplicationRef, Type } from '@angular/core'
import { useEffect, useRef, useState } from 'react'

type AngularComponentModule = { default: Type<unknown> }

export function useAngularMount(loader: () => Promise<AngularComponentModule>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const angularAppRef = useRef<ApplicationRef | null>(null)
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
        // @angular/compiler is imported for its JIT side effects only
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
      // Belt-and-suspenders: Angular's destroy may leave a stray comment node
      // behind on the React-owned container.
      containerRef.current?.replaceChildren()
    }
  }, [isMounted])

  return { containerRef }
}
