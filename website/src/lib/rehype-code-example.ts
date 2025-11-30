import type { Plugin } from 'unified'
//@ts-ignore
import type { Root } from 'hast'
import { visit } from 'unist-util-visit'

interface FileInfo {
  filename: string
  code: string
  language: string
  fullPath: string
  highlightedCode?: string
}

// Use dynamic import to avoid ESM/CJS issues
let highlighterPromise: Promise<any> | null = null

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter, bundledLanguages } = await import('shiki')

      return createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: Object.keys(bundledLanguages).filter((l) => l !== 'mermaid'),
      })
    })()
  }
  return highlighterPromise
}

/**
 * Create an MDX JSX attribute with a complex expression value (for arrays/objects)
 */
function createFilesAttribute(files: FileInfo[]) {
  const elements = files.map((file) => ({
    type: 'ObjectExpression',
    properties: [
      {
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Identifier', name: 'filename' },
        value: {
          type: 'Literal',
          value: file.filename,
          raw: JSON.stringify(file.filename),
        },
        kind: 'init',
      },
      {
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Identifier', name: 'code' },
        value: {
          type: 'Literal',
          value: file.code,
          raw: JSON.stringify(file.code),
        },
        kind: 'init',
      },
      {
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Identifier', name: 'language' },
        value: {
          type: 'Literal',
          value: file.language,
          raw: JSON.stringify(file.language),
        },
        kind: 'init',
      },
      {
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Identifier', name: 'highlightedCode' },
        value: {
          type: 'Literal',
          value: file.highlightedCode || '',
          raw: JSON.stringify(file.highlightedCode || ''),
        },
        kind: 'init',
      },
    ],
  }))

  return {
    type: 'mdxJsxAttribute',
    name: 'files',
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: JSON.stringify(files),
      data: {
        estree: {
          type: 'Program',
          body: [
            {
              type: 'ExpressionStatement',
              expression: {
                type: 'ArrayExpression',
                elements,
              },
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
 * Rehype plugin that highlights code in CodeExample components using shiki.
 * Supports multiple files with individual highlighting.
 */
export const rehypeCodeExample: Plugin<[], Root> = () => {
  return async (tree) => {
    const highlighter = await getHighlighter()
    const nodesToProcess: Array<{ node: any; files: FileInfo[] }> = []

    // First pass: collect all nodes that need processing
    visit(tree, (node: any) => {
      if (node.type !== 'mdxJsxFlowElement' || node.name !== 'CodeExample') {
        return
      }

      const needsHighlighting = node.attributes?.find(
        (attr: any) => attr.name === '__needsHighlighting',
      )
      if (!needsHighlighting) return

      const filesAttr = node.attributes?.find(
        (attr: any) => attr.name === '__codeFiles',
      )
      if (!filesAttr?.value) return

      try {
        const files: FileInfo[] = JSON.parse(filesAttr.value)
        nodesToProcess.push({ node, files })
      } catch (e) {
        console.warn('[rehype-code-example] Could not parse __codeFiles')
      }
    })

    // Second pass: highlight all files
    for (const { node, files } of nodesToProcess) {
      const highlightedFiles: FileInfo[] = []

      for (const file of files) {
        try {
          const highlighted = highlighter.codeToHtml(file.code.trim(), {
            lang: file.language,
            themes: {
              light: 'github-light',
              dark: 'github-dark',
            },
          })

          // Extract inner HTML from <code>...</code>
          const innerMatch = highlighted.match(/<code[^>]*>([\s\S]*)<\/code>/)
          const innerHtml = innerMatch ? innerMatch[1] : highlighted

          highlightedFiles.push({
            ...file,
            highlightedCode: innerHtml,
          })
        } catch (err) {
          console.warn(
            `[rehype-code-example] Failed to highlight ${file.filename}:`,
            err,
          )
          highlightedFiles.push(file)
        }
      }

      // Remove internal attributes
      node.attributes = node.attributes.filter(
        (attr: any) =>
          attr.name !== '__needsHighlighting' && attr.name !== '__codeFiles',
      )

      // Add the processed files array
      node.attributes.push(createFilesAttribute(highlightedFiles))
    }
  }
}
