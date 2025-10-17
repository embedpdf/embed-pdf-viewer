import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import { execSync } from 'node:child_process';

/**
 * Post-build script for svelte-package to maintain framework-specific shared directories
 * 
 * This script:
 * 1. Builds the src/shared directory using svelte-package to dist/shared-svelte
 * 2. Updates all imports in dist/svelte from ../../shared to ../../shared-svelte
 * 
 * This is necessary because svelte-package doesn't use Vite's beforeWriteFile hook,
 * which normally renames shared directories for framework builds (shared-react, shared-vue, etc.)
 * 
 * Usage: node node_modules/@embedpdf/build/src/scripts/post-svelte-build.js
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine the package root (where package.json is located)
// Assuming script is called from the package root
const pkgRoot = process.cwd();
const distDir = path.join(pkgRoot, 'dist');
const svelteDistDir = path.join(distDir, 'svelte');
const sharedSrcDir = path.join(pkgRoot, 'src', 'shared');
const sharedSvelteDistDir = path.join(distDir, 'shared-svelte');

// Step 1: Build shared directory using svelte-package
if (fs.existsSync(sharedSrcDir)) {
  console.log('Building shared directory with svelte-package...');
  
  // Remove existing shared-svelte if it exists
  if (fs.existsSync(sharedSvelteDistDir)) {
    fs.rmSync(sharedSvelteDistDir, { recursive: true });
  }
  
  // Use svelte-package to build the shared directory
  try {
    execSync('svelte-package -i src/shared -o dist/shared-svelte', { 
      cwd: pkgRoot,
      stdio: 'inherit' 
    });
    console.log('✓ Built shared to shared-svelte');
  } catch (error) {
    console.error('Failed to build shared directory:', error.message);
    process.exit(1);
  }
} else {
  console.warn('Warning: src/shared directory not found, skipping shared build');
}

// Step 2: Update imports in all Svelte dist files
if (fs.existsSync(svelteDistDir)) {
  console.log('Updating imports in Svelte dist files...');
  
  const jsFiles = globSync('**/*.js', { cwd: svelteDistDir, absolute: true });
  const dtsFiles = globSync('**/*.d.ts', { cwd: svelteDistDir, absolute: true });
  const svelteFiles = globSync('**/*.svelte', { cwd: svelteDistDir, absolute: true });
  const allFiles = [...jsFiles, ...dtsFiles, ...svelteFiles];
  
  let updatedCount = 0;
  
  for (const filePath of allFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Replace imports: ../../shared -> ../../shared-svelte
    content = content.replace(/\.\.\/\.\.\/shared/g, '../../shared-svelte');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      updatedCount++;
    }
  }
  
  console.log(`✓ Updated ${updatedCount} file(s) with corrected imports`);
} else {
  console.warn('Warning: dist/svelte directory not found, skipping import updates');
}

console.log('Post-Svelte build complete!');
