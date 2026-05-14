import type { Framework } from './code-showcase'

/**
 * Runtime safeguard for unexpected values and compile-time exhaustiveness check
 * when the Framework union grows.
 */
const assertUnreachable = (framework: never): never => {
  throw new Error(`Unsupported framework: ${String(framework)}`)
}

export const getDocumentationLink = (framework: Framework): string => {
  switch (framework) {
    case 'react':
      return '/docs/react/viewer/introduction'
    case 'vue':
      return '/docs/vue/viewer/introduction'
    case 'svelte':
      return '/docs/svelte/viewer/introduction'
    case 'angular':
      return '/docs/angular/viewer/introduction'
    case 'snippet':
      return '/docs/snippet/introduction'
  }

  // Keep the switch exhaustive without hiding future additions behind a default.
  return assertUnreachable(framework)
}

export const getButtonText = (framework: Framework): string => {
  switch (framework) {
    case 'react':
      return 'Read React Documentation'
    case 'vue':
      return 'Read Vue Documentation'
    case 'svelte':
      return 'Read Svelte Documentation'
    case 'angular':
      return 'Read Angular Documentation'
    case 'snippet':
      return 'Read Snippet Documentation'
  }

  // Keep the switch exhaustive without hiding future additions behind a default.
  return assertUnreachable(framework)
}
