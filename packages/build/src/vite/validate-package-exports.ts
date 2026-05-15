import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface Options {
  /**
   * The build mode's output prefix (e.g. 'angular', 'react'). Each Vite mode
   * only emits its own slice of dist/, so the validator must scope checks
   * accordingly: only entries whose target path begins with `<outputPrefix>/`
   * are validated in modes that have a prefix; in the base (no-prefix) mode
   * the validator skips any entry that lives under a known framework prefix
   * since those are produced by the matching framework mode.
   */
  outputPrefix?: string;
}

// Must mirror the framework cases in defineLibrary() (packages/build/src/vite/index.ts).
// When a new framework mode is added there, add its outputPrefix here so the
// base-mode validator correctly skips those dist/ entries.
const FRAMEWORK_PREFIXES = ['react', 'preact', 'vue', 'svelte', 'angular'];

interface PackageJsonExports {
  types?: string;
  module?: string;
  main?: string;
  exports?: unknown;
}

function collectAdvertisedTargets(pkg: PackageJsonExports): string[] {
  const targets = new Set<string>();
  for (const key of ['types', 'module', 'main'] as const) {
    const value = pkg[key];
    if (typeof value === 'string') targets.add(value);
  }
  walkExports(pkg.exports, targets);
  return [...targets];
}

function walkExports(node: unknown, sink: Set<string>): void {
  if (typeof node === 'string') {
    sink.add(node);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) walkExports(value, sink);
  }
}

function isInsideDist(target: string): boolean {
  const normalized = target.replace(/^\.\//, '');
  return normalized.startsWith('dist/');
}

function relativeToDist(target: string): string {
  return target.replace(/^\.\//, '').replace(/^dist\//, '');
}

function isUnderPrefix(distRelativePath: string, prefix: string): boolean {
  return distRelativePath === prefix || distRelativePath.startsWith(`${prefix}/`);
}

export function validatePackageExports({ outputPrefix = '' }: Options = {}): Plugin {
  return {
    name: 'embedpdf:validate-package-exports',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        const pkgRoot = process.cwd();
        const pkgPath = path.join(pkgRoot, 'package.json');
        if (!fs.existsSync(pkgPath)) return;

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJsonExports;
        const distRoot = path.join(pkgRoot, 'dist');

        const targets = collectAdvertisedTargets(pkg).filter(isInsideDist);
        const missing: string[] = [];

        for (const target of targets) {
          const distRelative = relativeToDist(target);
          const ownsByPrefix = outputPrefix
            ? isUnderPrefix(distRelative, outputPrefix)
            : !FRAMEWORK_PREFIXES.some((p) => isUnderPrefix(distRelative, p));
          if (!ownsByPrefix) continue;

          const absolute = path.join(distRoot, distRelative);
          if (!fs.existsSync(absolute) || fs.statSync(absolute).size === 0) {
            missing.push(target);
          }
        }

        if (missing.length) {
          const list = missing.map((t) => `  - ${t}`).join('\n');
          throw new Error(
            `[@embedpdf/build] package.json advertises exports that the build did not produce:\n${list}\n` +
              `Mode: ${outputPrefix || 'base'}. Cwd: ${pkgRoot}`,
          );
        }
      },
    },
  };
}
