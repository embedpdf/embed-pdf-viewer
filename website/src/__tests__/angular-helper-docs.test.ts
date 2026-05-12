import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Docs-lint: ensures every `createPluginCapabilitySignal` /
// `createDocumentScopeSignal` helper shown in Angular viewer docs is invoked
// as a signal (`name()`) before member access. Catches the common
// copy-paste error of writing `docZoom?.zoomIn()` instead of
// `docZoom()?.zoomIn()` in published examples.

// Lives under src/__tests__/ rather than co-located inside src/content/docs/
// because nextra's webpack sync-require context (./src/content/ sync ^\.\/.*.*$)
// pulls every file under content/ into the docs bundle, which broke the Next.js
// build when this file used `new URL('./', import.meta.url)`.
const viewerDocsDir = fileURLToPath(
  new URL('../content/docs/angular/viewer/', import.meta.url),
)

const collectMdxFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        return collectMdxFiles(entryPath)
      }

      return entry.name.endsWith('.mdx') ? [entryPath] : []
    }),
  )

  return files.flat()
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const helperSignalNames = (content: string, pattern: RegExp) => {
  return [...content.matchAll(pattern)].map((match) => match[1])
}

const tsCodeBlocks = (content: string) => {
  return [...content.matchAll(/```(?:ts|tsx|typescript)\b[\s\S]*?```/g)].map(
    (match) => match[0],
  )
}

// One representative pinned snippet so a failure points at a concrete example
// of the rule the general sweep below enforces.
test('zoom helper snippets invoke the document-scoped signal before calling zoom actions', async () => {
  const content = await readFile(
    new URL(
      '../content/docs/angular/viewer/plugins/plugin-zoom.mdx',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    content,
    /const docZoom = createDocumentScopeSignal\(zoom, 'my-document-id'\);/,
  )
  assert.match(content, /docZoom\(\)\?\.zoomIn\(\);/)
  assert.match(content, /docZoom\(\)\?\.zoomOut\(\);/)
  assert.match(content, /docZoom\(\)\?\.requestZoom\(ZoomMode\.FitWidth\);/)
})

test('all Angular viewer helper snippets call signal helpers before member access', async () => {
  const files = await collectMdxFiles(viewerDocsDir)

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    const relativePath = relative(viewerDocsDir, file)
    const blocks = tsCodeBlocks(content)

    for (const [index, block] of blocks.entries()) {
      const localSignals = helperSignalNames(
        block,
        /const\s+(\w+)\s*=\s*create(?:PluginCapabilitySignal|DocumentScopeSignal)\b/g,
      )
      const readonlySignals = helperSignalNames(
        block,
        /readonly\s+(\w+)\s*=\s*create(?:PluginCapabilitySignal|DocumentScopeSignal)\b/g,
      )

      for (const signalName of localSignals) {
        const escapedName = escapeRegExp(signalName)

        assert.doesNotMatch(
          block,
          new RegExp(`\\b${escapedName}\\?\\.\\w`),
          `${relativePath} code block ${index + 1} should invoke local helper signal \`${signalName}()\` before optional chaining`,
        )
        assert.doesNotMatch(
          block,
          new RegExp(`\\b${escapedName}\\.\\w`),
          `${relativePath} code block ${index + 1} should invoke local helper signal \`${signalName}()\` before member access`,
        )
      }

      for (const signalName of readonlySignals) {
        const escapedName = escapeRegExp(signalName)

        assert.doesNotMatch(
          block,
          new RegExp(`\\bthis\\.${escapedName}\\?\\.\\w`),
          `${relativePath} code block ${index + 1} should invoke readonly helper signal \`this.${signalName}()\` before optional chaining`,
        )
        assert.doesNotMatch(
          block,
          new RegExp(`\\bthis\\.${escapedName}\\.\\w`),
          `${relativePath} code block ${index + 1} should invoke readonly helper signal \`this.${signalName}()\` before member access`,
        )
        assert.match(
          block,
          new RegExp(`\\bthis\\.${escapedName}\\(\\)`),
          `${relativePath} code block ${index + 1} should show readonly helper signal \`this.${signalName}()\` being invoked`,
        )
      }
    }
  }
})
