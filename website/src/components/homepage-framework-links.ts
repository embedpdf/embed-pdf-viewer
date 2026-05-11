import type { Framework } from './code-showcase'

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
}
