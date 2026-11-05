#!/usr/bin/env node

// Checks that a generated SDK reads a response from a newer server: the
// fixture is an annotation list with an unknown field (at the top and nested),
// an annotation of a subtype the SDK doesn't know, and an enum value it doesn't
// know (docs/conventions/api-evolution.md, "Reading tolerantly"). Each language
// reads it the way its client reads an annotation list response.
//
//   node fern/scripts/check-tolerant-reading.mjs <language>
//
// Run after the SDK is generated and built (.github/workflows/sdk-generate.yml
// does). A check that has to live inside the SDK tree (a Go, Java or C# test)
// is copied in for the run and removed afterwards, so the tree stays exactly
// what the generator wrote.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LANGUAGES } from './sdk-version.mjs';

const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));
const checks = `${repositoryDirectory}fern/tolerant-reading`;
const fixture = `${checks}/annotation-list.json`;
const expected = 'annotations: 3';

function sdkDirectory(language) {
  return language === 'typescript'
    ? `${repositoryDirectory}cloudpdf/sdk`
    : `${repositoryDirectory}sdks/${language}`;
}

/** How each language reads the fixture: what to copy in, what to run, and where. */
function planFor(language, sdk) {
  switch (language) {
    case 'typescript':
      return {
        run: [process.execPath, [`${checks}/typescript/check-tolerant-reading.mjs`]],
        cwd: repositoryDirectory,
        prints: true,
      };
    case 'python':
      return {
        run: ['python3', [`${checks}/python/check_tolerant_reading.py`]],
        cwd: sdk,
        env: { PYTHONPATH: `${sdk}/src`, PYTHONDONTWRITEBYTECODE: '1' },
        prints: true,
      };
    case 'go':
      return {
        copies: [['go/tolerant_reading_test.go', 'tolerant_reading_test.go']],
        run: ['go', ['test', '-count=1', '-run', '^TestTolerantReading$', '-v', '.']],
        cwd: sdk,
        prints: true,
      };
    case 'java':
      return {
        copies: [['java/TolerantReadingTest.java', 'src/test/java/api/TolerantReadingTest.java']],
        run: [
          './gradlew',
          ['test', '--no-daemon', '--tests', 'com.cloudpdf.api.TolerantReadingTest'],
        ],
        cwd: sdk,
        prints: false,
      };
    case 'csharp':
      return {
        copies: [['csharp/TolerantReadingTest.cs', 'src/CloudPDF.Test/TolerantReadingTest.cs']],
        run: [
          'dotnet',
          [
            'test',
            'src/CloudPDF.Test/CloudPDF.Test.csproj',
            '--filter',
            'FullyQualifiedName~TolerantReadingTest',
            '--logger',
            'console;verbosity=detailed',
          ],
        ],
        cwd: sdk,
        prints: true,
      };
    case 'php': {
      // Autoloading writes vendor/, so the check runs in a copy of the tree.
      const copy = mkdtempSync(join(tmpdir(), 'cloudpdf-php-'));
      cpSync(sdk, copy, { recursive: true, filter: (path) => !path.includes('/vendor') });
      cpSync(`${checks}/php/check-tolerant-reading.php`, `${copy}/check-tolerant-reading.php`);
      return {
        before: ['composer', ['dump-autoload', '--no-dev', '--no-interaction', '--quiet']],
        run: ['php', ['check-tolerant-reading.php']],
        cwd: copy,
        prints: true,
        cleanup: () => rmSync(copy, { recursive: true, force: true }),
      };
    }
    case 'ruby':
      return {
        run: ['ruby', ['-I', `${sdk}/lib`, `${checks}/ruby/check_tolerant_reading.rb`]],
        cwd: sdk,
        prints: true,
      };
    default:
      throw new Error(`no tolerant reading check for ${language}`);
  }
}

function run([command, args], cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env, CLOUDPDF_FIXTURE: fixture },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function main() {
  const language = process.argv[2];
  if (!LANGUAGES.includes(language)) {
    console.error(`Usage: node fern/scripts/check-tolerant-reading.mjs ${LANGUAGES.join('|')}`);
    process.exit(2);
  }
  const sdk = sdkDirectory(language);
  if (!existsSync(sdk)) throw new Error(`${language}: no generated SDK at ${sdk}`);

  const plan = planFor(language, sdk);
  const copied = (plan.copies ?? []).map(([from, to]) => {
    const target = `${plan.cwd}/${to}`;
    if (existsSync(target)) throw new Error(`${language}: the SDK already has ${to}`);
    cpSync(`${checks}/${from}`, target);
    return target;
  });
  try {
    if (plan.before) {
      const prepared = run(plan.before, plan.cwd, plan.env);
      if (prepared.status !== 0) throw new Error(`${language}: ${prepared.output}`);
    }
    const { status, output } = run(plan.run, plan.cwd, plan.env);
    if (status !== 0 || (plan.prints && !output.includes(expected))) {
      throw new Error(
        `${language}: the SDK doesn't read a response from a newer server\n${output}`,
      );
    }
    console.log(`${language}: reads a response from a newer server (${expected})`);
  } finally {
    for (const target of copied) rmSync(target, { force: true });
    plan.cleanup?.();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
