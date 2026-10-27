import path from 'node:path';

/**
 * A package's build holds its own files and nothing else. The bundler copies in whatever it
 * can't leave as an import: code from a package that isn't a dependency, and, in declarations,
 * any type whose name points at one, which an inferred type does whenever TypeScript happens to
 * reach it through that package. Such a copy ships a second version of another package's types
 * (react once carried 34 to 229 kB of the engine's, depending on the order TypeScript wrote the
 * files in), so the build fails instead. The package's own files outside `src/` are its own:
 * the engine inlines the worker its build script writes to `workers/`.
 *
 * A package meant to ship inside the build is listed in package.json `epdf.bundle`.
 */
export function ownSourceOnly(pkg, packageDir) {
  const bundle = pkg.epdf?.bundle ?? [];
  return {
    name: 'epdf:own-source-only',
    generateBundle(_options, output) {
      const copied = [];
      for (const chunk of Object.values(output)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of foreignModules(packageDir, chunk.moduleIds, bundle)) {
          copied.push(`  dist/${chunk.fileName} <- ${path.relative(packageDir, id)}`);
        }
      }
      if (copied.length === 0) return;
      this.error(
        `${pkg.name} copies another package's files into dist:\n${copied.join('\n')}\n` +
          `Give an exported value whose type is inferred a type that names it through a ` +
          `dependency (a named type the dependency exports), or import the code from a ` +
          `dependency. A package meant to ship inside the build goes in package.json "epdf.bundle".`,
      );
    },
  };
}

/** The modules in `moduleIds` from neither this package nor a package listed in `bundle`. */
export function foreignModules(packageDir, moduleIds, bundle = []) {
  const own = packageDir + path.sep;
  const installed = path.join(packageDir, 'node_modules') + path.sep;
  return moduleIds.filter((id) => {
    // A virtual module (rolldown's runtime helpers) has no file.
    if (!path.isAbsolute(id)) return false;
    if (id.startsWith(own) && !id.startsWith(installed)) return false;
    const name = nodeModulesPackage(id);
    return name === null || !bundle.includes(name);
  });
}

/** The package a file under `node_modules` belongs to, or null for a file outside one. */
function nodeModulesPackage(id) {
  const marker = `${path.sep}node_modules${path.sep}`;
  const at = id.lastIndexOf(marker);
  if (at < 0) return null;
  const [scope, name] = id.slice(at + marker.length).split(path.sep);
  return scope.startsWith('@') ? `${scope}/${name}` : scope;
}
