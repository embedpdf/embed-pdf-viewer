import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'
import fs from 'node:fs'
import path from 'node:path'

interface FileInfo {
  filename: string
  code: string
  language: string
  fullPath: string
  githubUrl?: string
}

interface RemarkCodeExampleOptions {
  /**
   * Base GitHub URL for the repository.
   * Example: 'https://github.com/embedpdf/embed-pdf-viewer/blob/main/'
   */
  githubBaseUrl?: string
}

const languageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  mdx: 'mdx',
}

function readCodeFile(
  codePath: string,
  githubBaseUrl?: string,
): FileInfo | null {
  const absolutePath = path.resolve(process.cwd(), 'src', codePath)

  try {
    const code = fs.readFileSync(absolutePath, 'utf-8')
    const ext = path.extname(codePath).slice(1)
    const filename = path.basename(codePath)

    // Calculate repo-relative path for GitHub URL
    const repoRelativePath = path.relative(process.cwd(), absolutePath)
    // Normalize to forward slashes for URLs
    const normalizedPath = repoRelativePath.split(path.sep).join('/')

    return {
      filename,
      code,
      language: languageMap[ext] || ext,
      fullPath: codePath,
      githubUrl: githubBaseUrl
        ? `${githubBaseUrl}${normalizedPath}`
        : undefined,
    }
  } catch (err) {
    console.warn(`[remark-code-example] Could not read file: ${absolutePath}`)
    return null
  }
}

/**
 * Remark plugin that processes CodeExample components.
 *
 * Automatically generates GitHub URLs for each file based on the githubBaseUrl option.
 *
 * Usage:
 * ```tsx
 * // Single file
 * <CodeExample codePath="content/docs/react/code-examples/example.tsx">
 *   <Demo />
 * </CodeExample>
 *
 * // Multiple files
 * <CodeExample codePaths={["path/to/file1.tsx", "path/to/file2.css"]}>
 *   <Demo />
 * </CodeExample>
 * ```
 */
export const remarkCodeExample: Plugin<[RemarkCodeExampleOptions?], Root> = (
  options = {},
) => {
  const { githubBaseUrl } = options

  return (tree, file) => {
    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      if (node.name !== 'CodeExample') return

      // Find codePath (single) or codePaths (multiple) attribute
      const codePathAttr = node.attributes?.find(
        (attr: any) =>
          attr.type === 'mdxJsxAttribute' && attr.name === 'codePath',
      )
      const codePathsAttr = node.attributes?.find(
        (attr: any) =>
          attr.type === 'mdxJsxAttribute' && attr.name === 'codePaths',
      )

      let paths: string[] = []

      // Handle single codePath
      if (codePathAttr?.value) {
        if (typeof codePathAttr.value === 'string') {
          paths = [codePathAttr.value]
        }
      }

      // Handle multiple codePaths (JSX expression: codePaths={["...", "..."]})
      if (codePathsAttr?.value) {
        const exprValue = codePathsAttr.value
        if (exprValue?.type === 'mdxJsxAttributeValueExpression') {
          // Try to extract array from estree
          try {
            const estree = exprValue.data?.estree
            const expr = estree?.body?.[0]?.expression
            if (expr?.type === 'ArrayExpression') {
              paths = expr.elements
                .filter(
                  (el: any) =>
                    el?.type === 'Literal' && typeof el.value === 'string',
                )
                .map((el: any) => el.value)
            }
          } catch (e) {
            console.warn(
              '[remark-code-example] Could not parse codePaths expression',
            )
          }
        }
      }

      if (paths.length === 0) return

      // Read all files (with GitHub URLs)
      const files: FileInfo[] = paths
        .map((p) => readCodeFile(p, githubBaseUrl))
        .filter((f): f is FileInfo => f !== null)

      if (files.length === 0) return

      // Remove codePath/codePaths attributes (no longer needed)
      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== 'codePath' && attr.name !== 'codePaths',
      )

      // Also remove any manually specified githubUrl (we generate it now)
      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== 'githubUrl',
      )

      // Add files data as JSON string (will be parsed by rehype plugin)
      node.attributes.push({
        type: 'mdxJsxAttribute',
        name: '__codeFiles',
        value: JSON.stringify(files),
      })

      // Mark for highlighting
      node.attributes.push({
        type: 'mdxJsxAttribute',
        name: '__needsHighlighting',
        value: 'true',
      })
    })
  }
}
