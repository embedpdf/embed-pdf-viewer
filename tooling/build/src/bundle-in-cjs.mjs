/**
 * What `epdf.bundleInCjs` adds to a build. The packages it lists are dependencies that are ES
 * modules only. The ES module output imports them. The CommonJS output holds them, code and
 * declarations, so that `require()` needs nothing else: `require()` of an ES module works on a
 * recent Node, and not on an older one, in Jest or in Electron.
 *
 * Two things follow. A license asks for its text to go where the code goes, so the build writes
 * each held package's notice to dist. And the CommonJS side must name none of the packages,
 * which is checked on the files the build wrote.
 */
import fs from 'node:fs';
import path from 'node:path';

import { isDeclaration, isOneOf, nodeModulesPackage } from './own-source-only.mjs';
import { importsIn, walk } from './package-files.mjs';

/** Where the notices go, beside the files that hold the packages. */
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
/** The CommonJS side of a build: its code and that code's declarations. */
const COMMONJS_FILE = /\.(cjs|d\.cts)$/;

/**
 * Writes `dist/THIRD-PARTY-NOTICES.txt`: the name, version and license of each package the
 * CommonJS code holds. The versions say which ones this build carries. The list is made from
 * the files that were bundled, so it can't fall behind them.
 */
export function bundledNotices(pkg, packageDir) {
  return {
    name: 'epdf:bundled-notices',
    generateBundle(options, output) {
      if (options.format !== 'cjs') return;
      const own = packageDir + path.sep;
      const installed = path.join(packageDir, 'node_modules') + path.sep;
      const roots = new Set();
      for (const chunk of Object.values(output)) {
        if (chunk.type !== 'chunk' || isDeclaration(chunk.fileName)) continue;
        for (const id of chunk.moduleIds) {
          // A virtual module has no file, and the package's own files need no notice.
          if (!path.isAbsolute(id)) continue;
          if (id.startsWith(own) && !id.startsWith(installed)) continue;
          const found = nodeModulesPackage(id);
          if (found) roots.add(found.root);
        }
      }
      if (roots.size === 0) return;
      const packages = [];
      for (const root of roots) {
        const bundled = readBundledPackage(root);
        if (bundled.text === null) {
          this.error(
            `${pkg.name} holds ${bundled.name} in its CommonJS build, and ${bundled.name} ` +
              `ships no license file to copy into ${NOTICES_FILE}`,
          );
        }
        packages.push(bundled);
      }
      this.emitFile({
        type: 'asset',
        fileName: NOTICES_FILE,
        source: noticesText(pkg.name, packages),
      });
    },
  };
}

/** A bundled package's name, version, license and license text (null when it ships none). */
export function readBundledPackage(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const file = fs.readdirSync(root).find((entry) => LICENSE_FILE.test(entry));
  return {
    name: manifest.name,
    version: manifest.version,
    license: typeof manifest.license === 'string' ? manifest.license : null,
    text: file ? fs.readFileSync(path.join(root, file), 'utf8').trim() : null,
  };
}

/** The notices file: the packages by name, each with its version, license and license text. */
export function noticesText(packageName, packages) {
  const rule = '='.repeat(80);
  const sections = [...packages]
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .map(
      ({ name, version, license, text }) =>
        `${rule}\n${name} ${version}${license ? `\nLicense: ${license}` : ''}\n${rule}\n\n${text}\n`,
    );
  return (
    `Third-party notices for ${packageName}\n\n` +
    `The CommonJS files of this package (dist/*.cjs, with their declarations in\n` +
    `dist/*.d.cts) hold the packages below, so that require() needs nothing else. The ES\n` +
    `module files import them. Each package is under its own license, which follows its\n` +
    `name.\n\n` +
    sections.join('\n')
  );
}

/**
 * The places where the CommonJS side of `dist` still names a package it is meant to hold: an
 * import or a `require()` of one, in a `.cjs` file or a `.d.cts` declaration.
 */
export function commonJsImportsOf(dist, names) {
  return walk(dist)
    .filter((file) => COMMONJS_FILE.test(file))
    .flatMap((file) =>
      importsIn(fs.readFileSync(file, 'utf8'), file)
        .filter(({ specifier }) => isOneOf(names, specifier))
        .map(({ specifier }) => ({ file: path.relative(dist, file), specifier })),
    );
}

/** Fails the build of a package whose CommonJS side still names what `epdf.bundleInCjs` lists. */
export function assertCommonJsHoldsThem(packageDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const names = pkg.epdf?.bundleInCjs ?? [];
  if (names.length === 0) return;
  const dist = path.join(packageDir, 'dist');
  const left = commonJsImportsOf(dist, names);
  if (left.length > 0) {
    throw new Error(
      `${pkg.name} lists these in package.json "epdf.bundleInCjs", and the CommonJS side of ` +
        `dist still names them:\n` +
        left.map(({ file, specifier }) => `  dist/${file} names ${specifier}`).join('\n'),
    );
  }
  if (!fs.existsSync(path.join(dist, NOTICES_FILE))) {
    throw new Error(`${pkg.name} holds packages in its CommonJS build and wrote no ${NOTICES_FILE}`);
  }
}
