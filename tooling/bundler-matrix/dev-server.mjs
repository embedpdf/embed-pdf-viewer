/**
 * A matrix app under its dev server, with the packages as a user installs them.
 *
 * Inside this workspace a dev server proves nothing about the packages: an app's `@embedpdf/*`
 * dependencies are links to folders whose `package.json` is the workspace one, and a dev server
 * does not prebundle a linked package. A user's copy comes from npm: files under `node_modules`,
 * with the published export map. Vite's dev server (the Angular CLI's too) prebundles those, and
 * up to Vite 7 that step moves a package into a cache folder without its files.
 *
 * So a dev row packs every workspace package the app depends on (`pnpm pack`, which writes the
 * published `package.json`), copies the app to a folder outside the workspace, installs it there
 * with npm from those packs, and starts the app's dev server.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, '..', '..');

/** What the app's own tools leave behind: never part of the copy. */
const NOT_COPIED = new Set(['node_modules', 'dist', '.angular', '.next', '.parcel-cache']);

const readManifest = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

/** The names of the workspace packages `manifest` needs installed: optional ones are left to npm. */
export function workspaceDependencies(manifest) {
  return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter(([, range]) => String(range).startsWith('workspace:'))
    .map(([name]) => name);
}

/**
 * Packs workspace packages on demand, each once per run. `pack(name)` returns the tarballs of
 * that package and of every workspace package it depends on, by name.
 */
export function createPacker() {
  const directory = mkdtempSync(join(tmpdir(), 'bundler-matrix-packs-'));
  let folders = null;
  const tarballs = new Map();

  const folderOf = (name) => {
    folders ??= new Map(
      JSON.parse(
        execFileSync('pnpm', ['ls', '-r', '--depth', '-1', '--json'], {
          cwd: workspaceRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      ).map((project) => [project.name, project.path]),
    );
    const folder = folders.get(name);
    if (!folder) throw new Error(`${name} is not a package of this workspace`);
    return folder;
  };

  const pack = (name, into = new Map()) => {
    if (into.has(name)) return into;
    const folder = folderOf(name);
    if (!tarballs.has(name)) {
      const output = execFileSync('pnpm', ['pack', '--pack-destination', directory], {
        cwd: folder,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const tarball = output
        .split('\n')
        .map((line) => line.trim())
        .findLast((line) => line.endsWith('.tgz'));
      if (!tarball) throw new Error(`pnpm pack of ${name} named no tarball:\n${output}`);
      tarballs.set(name, join(directory, basename(tarball)));
    }
    into.set(name, tarballs.get(name));
    // A dev dependency of a dependency is not installed with it.
    for (const dependency of workspaceDependencies({
      dependencies: readManifest(folder).dependencies,
    }))
      pack(dependency, into);
    return into;
  };

  return { pack, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

/**
 * The app's `package.json` for npm: each workspace dependency is its pack, and `overrides` gives
 * every pack to whichever package asks for it, since a pack names the others by version.
 */
export function installedFromPacks(manifest, packs) {
  const installed = structuredClone(manifest);
  for (const field of ['dependencies', 'devDependencies'])
    for (const name of Object.keys(installed[field] ?? {}))
      if (packs.has(name)) installed[field][name] = `file:${packs.get(name)}`;
  installed.overrides = Object.fromEntries(
    [...packs].map(([name, tarball]) => [name, `file:${tarball}`]),
  );
  return installed;
}

/** Copies the app at `appDir` out of the workspace and installs it there from packs. */
export function installFromPacks(appDir, packer) {
  const folder = mkdtempSync(join(tmpdir(), `bundler-matrix-${basename(appDir)}-`));
  cpSync(appDir, folder, {
    recursive: true,
    filter: (source) => !NOT_COPIED.has(basename(source)),
  });
  const manifest = readManifest(folder);
  const packs = new Map();
  for (const name of workspaceDependencies(manifest)) packer.pack(name, packs);
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify(installedFromPacks(manifest, packs), null, 2) + '\n',
  );
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: folder,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return { folder, dispose: () => rmSync(folder, { recursive: true, force: true }) };
}

function freePort() {
  return new Promise((ok, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => ok(port));
    });
  });
}

/**
 * Starts `npm run <script> -- --port <port>` in `folder` and waits until the server answers.
 * `stop()` ends the server and whatever it started.
 */
export async function startDevServer(folder, script, { timeoutMs = 120_000 } = {}) {
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const log = [];
  // A developer's shell, not this runner's or a CI job's: a dev server takes its mode from
  // NODE_ENV, and the Angular CLI prebundles nothing where CI is set.
  const { NODE_ENV: _mode, CI: _ci, ...env } = process.env;
  // Its own process group: `npm run` starts the CLI, which starts its workers.
  const child = spawn('npm', ['run', script, '--', '--port', String(port)], {
    cwd: folder,
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => log.push(String(chunk)));
  child.stderr.on('data', (chunk) => log.push(String(chunk)));
  let exited = false;
  child.once('exit', () => (exited = true));
  const stop = () => {
    if (exited) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  };

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (exited) throw new Error(`the dev server stopped before it answered:\n${log.join('')}`);
    if (Date.now() > deadline) {
      stop();
      throw new Error(`the dev server did not answer within ${timeoutMs} ms:\n${log.join('')}`);
    }
    try {
      const response = await fetch(origin, { headers: { accept: 'text/html' } });
      await response.arrayBuffer();
      if (response.ok) return { origin, stop };
    } catch {
      // Not listening yet.
    }
    await new Promise((ok) => setTimeout(ok, 250));
  }
}
