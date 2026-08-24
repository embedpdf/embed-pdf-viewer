import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { normalizeSdkBranding, normalizeSdkReadme } from './sdk-branding.mjs';

test('normalizes generated SDK README branding', () => {
  const generated = `# Cloudpdf PHP Library

[badge](https://example.com?utm_source=Cloudpdf%2FPHP)

The Cloudpdf PHP library provides convenient access to the Cloudpdf APIs from PHP.

~~~php
use Cloudpdf\\CloudpdfClient;
~~~
`;

  assert.equal(
    normalizeSdkReadme(generated, 'php'),
    `# CloudPDF PHP SDK

[badge](https://example.com?utm_source=Cloudpdf%2FPHP)

The official PHP SDK for the CloudPDF API.

~~~php
use CloudPDF\\CloudPDFClient;
~~~
`,
  );
});

test('normalizes inline code without changing Markdown link destinations', () => {
  const generated = `# Cloudpdf PHP Library

[Cloudpdf docs](https://example.com/Cloudpdf?utm_source=Cloudpdf)

The Cloudpdf PHP library provides convenient access to the Cloudpdf APIs from PHP.

Catch \`CloudpdfException\`.
`;

  const normalized = normalizeSdkReadme(generated, 'php');
  assert.match(
    normalized,
    /\[Cloudpdf docs\]\(https:\/\/example\.com\/Cloudpdf\?utm_source=Cloudpdf\)/,
  );
  assert.match(normalized, /Catch `CloudPDFException`\./);
});

test('uses .NET rather than the generator C# label', () => {
  const generated = `# Cloudpdf C# Library

The Cloudpdf C# library provides convenient access to the Cloudpdf APIs from C#.
`;

  assert.match(normalizeSdkReadme(generated, 'csharp'), /^# CloudPDF \.NET SDK$/m);
  assert.match(
    normalizeSdkReadme(generated, 'csharp'),
    /^The official \.NET SDK for the CloudPDF API\.$/m,
  );
});

test('fails visibly if Fern changes its generated README description', () => {
  assert.throws(
    () => normalizeSdkReadme('# Cloudpdf Ruby Library\n\nUnexpected copy.\n', 'ruby'),
    /generated README description format changed/,
  );
});

test('fails visibly if Fern changes its generated README title', () => {
  assert.throws(
    () =>
      normalizeSdkReadme(
        '# Unexpected Ruby heading\n\nThe Cloudpdf Ruby library provides convenient access to the Cloudpdf APIs from Ruby.\n',
        'ruby',
      ),
    /generated README title format changed/,
  );
});

test('normalizes PHP exception identifiers that the generator cannot configure', () => {
  const outputDirectory = mkdtempSync(`${tmpdir()}/cloudpdf-php-sdk-`);
  try {
    mkdirSync(`${outputDirectory}/src/Exceptions`, { recursive: true });
    mkdirSync(`${outputDirectory}/src/Documents`, { recursive: true });
    mkdirSync(`${outputDirectory}/tests`, { recursive: true });
    writeFileSync(
      `${outputDirectory}/src/.php-cs-fixer.cache`,
      '{"hashes":{"Exceptions/CloudpdfException.php":"hash"}}\n',
    );
    writeFileSync(
      `${outputDirectory}/README.md`,
      '# Cloudpdf PHP Library\n\nThe Cloudpdf PHP library provides convenient access to the Cloudpdf APIs from PHP.\n',
    );
    writeFileSync(
      `${outputDirectory}/src/Exceptions/CloudpdfException.php`,
      'class CloudpdfException {}\n',
    );
    writeFileSync(
      `${outputDirectory}/src/Exceptions/CloudpdfApiException.php`,
      'class CloudpdfApiException extends CloudpdfException {}\n',
    );
    writeFileSync(
      `${outputDirectory}/src/Documents/Client.php`,
      'use CloudPDF\\Exceptions\\CloudpdfApiException;\n',
    );
    writeFileSync(
      `${outputDirectory}/tests/ExceptionTest.php`,
      'use CloudPDF\\Exceptions\\CloudpdfException;\n',
    );

    normalizeSdkBranding(outputDirectory, 'php');
    normalizeSdkBranding(outputDirectory, 'php');

    assert.match(
      readFileSync(`${outputDirectory}/src/Exceptions/CloudPDFException.php`, 'utf8'),
      /class CloudPDFException/,
    );
    assert.match(
      readFileSync(`${outputDirectory}/src/Exceptions/CloudPDFApiException.php`, 'utf8'),
      /extends CloudPDFException/,
    );
    assert.match(
      readFileSync(`${outputDirectory}/src/Documents/Client.php`, 'utf8'),
      /CloudPDFApiException/,
    );
    assert.match(
      readFileSync(`${outputDirectory}/tests/ExceptionTest.php`, 'utf8'),
      /CloudPDFException/,
    );
    assert.throws(
      () => readFileSync(`${outputDirectory}/src/.php-cs-fixer.cache`, 'utf8'),
      /ENOENT/,
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('keeps the Ruby gem and require path lowercase with a CloudPDF module', () => {
  const outputDirectory = mkdtempSync(`${tmpdir()}/cloudpdf-ruby-sdk-`);
  try {
    mkdirSync(`${outputDirectory}/lib`, { recursive: true });
    writeFileSync(
      `${outputDirectory}/README.md`,
      '# Cloudpdf Ruby Library\n\nThe Cloudpdf Ruby library provides convenient access to the Cloudpdf APIs from Ruby.\n\n```ruby\nrequire "CloudPDF"\n```\n',
    );
    writeFileSync(`${outputDirectory}/CloudPDF.gemspec`, 'spec.name = "CloudPDF"\n');
    writeFileSync(`${outputDirectory}/lib/CloudPDF.rb`, 'module CloudPDF\nend\n');

    normalizeSdkBranding(outputDirectory, 'ruby');
    normalizeSdkBranding(outputDirectory, 'ruby');

    assert.equal(
      readFileSync(`${outputDirectory}/cloudpdf.gemspec`, 'utf8'),
      'spec.name = "cloudpdf"\n',
    );
    assert.match(readFileSync(`${outputDirectory}/lib/cloudpdf.rb`, 'utf8'), /module CloudPDF/);
    assert.match(readFileSync(`${outputDirectory}/README.md`, 'utf8'), /require "cloudpdf"/);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
