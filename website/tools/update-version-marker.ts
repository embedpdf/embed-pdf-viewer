/**
 * Prebuild script that updates version markers in MDX files.
 *
 * This ensures Next.js/Vercel cache is invalidated when the snippet version changes,
 * because the MDX file content actually changes.
 *
 * Run with: npx tsx tools/update-version-marker.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from snippet package.json
const snippetPackageJson = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../viewers/snippet/package.json'),
    'utf8',
  ),
)
const version = snippetPackageJson.version

// Version marker pattern - invisible comment in MDX
const MARKER_PATTERN = /\{\/\* @embedpdf-version .* \*\/\}\n?/
const NEW_MARKER = `{/* @embedpdf-version ${version} */}\n`

// Find all MDX files recursively
function findMdxFiles(dir: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory() && entry !== 'node_modules') {
      files.push(...findMdxFiles(fullPath))
    } else if (entry.endsWith('.mdx')) {
      files.push(fullPath)
    }
  }

  return files
}

// Update MDX files that contain the placeholder
const contentDir = resolve(__dirname, '../src/content')
const mdxFiles = findMdxFiles(contentDir)

let updatedCount = 0

for (const filePath of mdxFiles) {
  const content = readFileSync(filePath, 'utf8')

  // Only process files that use the CDN URL placeholder
  if (!content.includes('__EMBEDPDF_JS_URL__')) {
    continue
  }

  let newContent: string

  if (MARKER_PATTERN.test(content)) {
    // Update existing marker
    newContent = content.replace(MARKER_PATTERN, NEW_MARKER)
  } else {
    // Add marker after frontmatter
    const frontmatterEnd = content.indexOf('---', 3)
    if (frontmatterEnd !== -1) {
      const insertPos = content.indexOf('\n', frontmatterEnd) + 1
      newContent =
        content.slice(0, insertPos) + NEW_MARKER + content.slice(insertPos)
    } else {
      // No frontmatter, add at start
      newContent = NEW_MARKER + content
    }
  }

  if (newContent !== content) {
    writeFileSync(filePath, newContent, 'utf8')
    updatedCount++
    console.log(`✓ Updated: ${filePath}`)
  }
}

console.log(
  `\n✓ Updated ${updatedCount} file(s) with version marker: ${version}`,
)
