import type { NextConfig } from 'next'
import nextra from 'nextra'
import type { Pluggable } from 'unified'
import { remarkNpm2Yarn } from '@theguild/remark-npm2yarn'
import { globSync } from 'glob'
import { visit } from 'unist-util-visit'
import { Plugin } from 'unified'
import { remarkCodeExample } from './src/lib/remark-code-example'
import { rehypeCodeExample } from './src/lib/rehype-code-example'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read snippet version from package.json for use in client components
const snippetPackageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../viewers/snippet/package.json'), 'utf8'),
)
const SNIPPET_VERSION = snippetPackageJson.version

/**
 * This plugin overrides the import source for the Tabs component to use the custom component
 * @param tree - The markdown AST
 * @returns The modified markdown AST
 */
const overrideNpm2YarnImports: Plugin = () => {
  return (tree) => {
    // Find and modify the import statements added by remarkNpm2Yarn
    visit(tree, 'mdxjsEsm', (node: any) => {
      if (node.data?.estree?.body) {
        for (const statement of node.data.estree.body) {
          // Look for import declarations from 'nextra/components'
          if (
            statement.type === 'ImportDeclaration' &&
            statement.source.value === 'nextra/components'
          ) {
            // Change the import source to your component
            statement.source.value = '@/components/tabs'
          }
        }
      }
    })

    return tree
  }
}

const withNextra = nextra({
  // ... Other Nextra config options,
  mdxOptions: {
    remarkPlugins: [
      [
        remarkNpm2Yarn, // should be before remarkRemoveImports because contains `import { Tabs as $Tabs, Tab as $Tab } from ...`
        {
          packageName: '@/components/tabs',
          tabNamesProp: 'items',
          storageKey: 'selectedPackageManager',
        },
      ] satisfies Pluggable,
      overrideNpm2YarnImports,
      [
        remarkCodeExample,
        {
          // Base GitHub URL for your repository
          githubBaseUrl:
            'https://github.com/embedpdf/embed-pdf-viewer/blob/main/website/',
        },
      ],
    ],
    rehypePlugins: [rehypeCodeExample], // Re-enabled with debugging
  },
})

// Pre-built example packages that should NOT be analyzed/transpiled by Next.js.
// These packages use Vue/Svelte and have their own build process.
// Next.js has issues with `export *` re-exports across package boundaries,
// which causes sporadic "Attempted import error" failures.
const EXTERNAL_EXAMPLE_PACKAGES = [
  '@embedpdf/example-vue-tailwind',
  '@embedpdf/example-svelte-tailwind',
]

// Export a function that handles phase-specific logic and merges with Nextra
export default async (phase: string) => {
  // Build config with env
  const nextConfig: NextConfig = {
    env: {
      NEXT_PUBLIC_SNIPPET_VERSION: SNIPPET_VERSION,
    },
    // Mark Vue/Svelte example packages as external for server-side bundling
    serverExternalPackages: EXTERNAL_EXAMPLE_PACKAGES,
  }

  // Add transpilePackages in development (but exclude the pre-built examples)
  if (phase === 'phase-development-server') {
    const fs = await import('node:fs')
    const allFiles = globSync('../packages/*/package.json')

    const packageNames = allFiles
      .map((file: any) => {
        try {
          const packageJson = JSON.parse(fs.readFileSync(file, 'utf8'))
          return packageJson.name
        } catch (error) {
          return null
        }
      })
      .filter((pkg: string) => pkg?.startsWith('@embedpdf'))
      // Explicitly exclude the example packages from transpilation
      .filter((pkg: string) => !EXTERNAL_EXAMPLE_PACKAGES.includes(pkg))

    nextConfig.transpilePackages = packageNames
  }

  // Apply Nextra wrapper
  const nextraWrapped = withNextra(nextConfig)

  // If nextra returns a function, call it with phase
  const finalConfig =
    typeof nextraWrapped === 'function'
      ? await (nextraWrapped as (phase: string) => Promise<NextConfig>)(phase)
      : nextraWrapped

  return finalConfig
}
