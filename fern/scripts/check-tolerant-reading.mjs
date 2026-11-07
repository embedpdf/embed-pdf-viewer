#!/usr/bin/env node

// Checks that a generated SDK reads responses from a newer server: an
// annotation list and a form with unknown fields (at the top and nested), an
// enum value the SDK doesn't know, and a kind it doesn't know in each open
// union (docs/conventions/api-evolution.md, "Reading tolerantly";
// fern/tolerant-reading/open-unions.json). Both carry null dates too, which
// fern-php-sdk read as an error before 2.30. Each language reads them the way
// its client reads an annotation list and a form response.
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
const fixtures = {
  CLOUDPDF_ANNOTATIONS_FIXTURE: `${checks}/annotation-list.json`,
  CLOUDPDF_FORM_FIXTURE: `${checks}/form.json`,
};
const expected = ['annotations: 5', 'fields: 2'];

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
    env: { ...process.env, ...env, ...fixtures },
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
    if (status !== 0 || (plan.prints && !expected.every((line) => output.includes(line)))) {
      throw new Error(`${language}: the SDK doesn't read responses from a newer server\n${output}`);
    }
    console.log(`${language}: reads responses from a newer server (${expected.join(', ')})`);
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
