import type { Framework } from './code-showcase'

export const getDocumentationLink = (framework: Framework) => {
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
    default:
      return '/docs/snippet/introduction'
  }
}

export const getButtonText = (framework: Framework) => {
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
    default:
      return 'Read Snippet Documentation'
  }
}
