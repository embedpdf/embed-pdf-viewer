//@ts-ignore
import type { Root } from 'hast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// Read version directly from package.json at build time
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const snippetPackageJson = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../viewers/snippet/package.json'),
    'utf8',
  ),
)
const EMBEDPDF_VERSION = snippetPackageJson.version

const EMBEDPDF_JS_URL = `https://cdn.jsdelivr.net/npm/@embedpdf/snippet@${EMBEDPDF_VERSION}/dist/embedpdf.js`
const DEMO_PDF_URL = 'https://snippet.embedpdf.com/ebook.pdf'

/**
 * Rehype plugin that replaces CDN URL placeholders in code blocks at build time.
 */
export const rehypeCdnUrls: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'text', (node: { value: string }) => {
      if (node.value.includes('__EMBEDPDF_JS_URL__')) {
        node.value = node.value.replace(/__EMBEDPDF_JS_URL__/g, EMBEDPDF_JS_URL)
      }
      if (node.value.includes('__DEMO_PDF_URL__')) {
        node.value = node.value.replace(/__DEMO_PDF_URL__/g, DEMO_PDF_URL)
      }
    })
  }
}
