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

function readCodeFile(codePath: string): FileInfo | null {
  const absolutePath = path.resolve(process.cwd(), 'src', codePath)

  try {
    const code = fs.readFileSync(absolutePath, 'utf-8')
    const ext = path.extname(codePath).slice(1)
    const filename = path.basename(codePath)

    return {
      filename,
      code,
      language: languageMap[ext] || ext,
      fullPath: codePath,
    }
  } catch (err) {
    console.warn(`[remark-code-example] Could not read file: ${absolutePath}`)
    return null
  }
}

/**
 * Create an MDX expression attribute for complex values (arrays, objects)
 */
function createMdxJsxExpressionAttribute(name: string, value: any) {
  const jsonValue = JSON.stringify(value)
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: jsonValue,
      data: {
        estree: {
          type: 'Program',
          body: [
            {
              type: 'ExpressionStatement',
              expression: JSON.parse(jsonValue) // Will be re-serialized by the estree generator
                ? {
                    type: 'ArrayExpression',
                    elements: value.map((item: any) => ({
                      type: 'ObjectExpression',
                      properties: Object.entries(item).map(([key, val]) => ({
                        type: 'Property',
                        method: false,
                        shorthand: false,
                        computed: false,
                        key: { type: 'Identifier', name: key },
                        value: {
                          type: 'Literal',
                          value: val,
                          raw: JSON.stringify(val),
                        },
                        kind: 'init',
                      })),
                    })),
                  }
                : { type: 'Literal', value: null },
            },
          ],
          sourceType: 'module',
          comments: [],
        },
      },
    },
  }
}

/**
 * Remark plugin that processes CodeExample components.
 *
 * Supports both single and multiple files:
 *
 * Single file:
 * <CodeExample codePath="path/to/file.tsx" githubUrl="...">
 *   <Demo />
 * </CodeExample>
 *
 * Multiple files (use JSX expression):
 * <CodeExample
 *   codePaths={["path/to/file1.tsx", "path/to/file2.css"]}
 *   githubUrl="..."
 * >
 *   <Demo />
 * </CodeExample>
 */
export const remarkCodeExample: Plugin<[], Root> = () => {
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

      // Read all files
      const files: FileInfo[] = paths
        .map((p) => readCodeFile(p))
        .filter((f): f is FileInfo => f !== null)

      if (files.length === 0) return

      // Remove codePath/codePaths attributes
      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== 'codePath' && attr.name !== 'codePaths',
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
