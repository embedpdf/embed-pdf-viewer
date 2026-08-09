import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ALLOWED_CASINGS = new Set(['cloudpdf', 'CloudPDF']);
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function maskCharacters(value, start, end) {
  return `${value.slice(0, start)}${value
    .slice(start, end)
    .replace(/[^\n]/g, ' ')}${value.slice(end)}`;
}

export function maskMarkdownLinkDestinations(markdown) {
  let masked = markdown;

  for (let index = 0; index < masked.length - 1; index += 1) {
    if (masked[index] !== ']' || masked[index + 1] !== '(') continue;

    let depth = 1;
    let cursor = index + 2;
    for (; cursor < masked.length && depth > 0; cursor += 1) {
      if (masked[cursor] === '\\') {
        cursor += 1;
        continue;
      }
      if (masked[cursor] === '(') depth += 1;
      if (masked[cursor] === ')') depth -= 1;
    }
    if (depth === 0) masked = maskCharacters(masked, index + 2, cursor - 1);
    index = cursor - 1;
  }

  masked = masked.replace(/<https?:\/\/[^>]+>/g, (url) => ' '.repeat(url.length));
  masked = masked.replace(
    /^(\s*\[[^\]]+\]:\s*)(.*)$/gm,
    (_line, prefix, destination) => `${prefix}${destination.replace(/[^\n]/g, ' ')}`,
  );
  masked = masked.replace(/\b(?:href|src)=(['"])(.*?)\1/gi, (attribute, _quote, destination) =>
    attribute.replace(destination, ' '.repeat(destination.length)),
  );

  return masked;
}

function noncanonicalMatches(value) {
  return [...value.matchAll(/cloudpdf/gi)].filter((match) => !ALLOWED_CASINGS.has(match[0]));
}

function decodeTextFile(path) {
  const contents = readFileSync(path);
  if (contents.includes(0)) return null;
  try {
    return textDecoder.decode(contents);
  } catch {
    return null;
  }
}

function entriesBelow(rootDirectory, directory = rootDirectory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    const relativePath = relative(rootDirectory, absolutePath);
    if (entry.isDirectory()) {
      return [
        { absolutePath, relativePath, isFile: false },
        ...entriesBelow(rootDirectory, absolutePath),
      ];
    }
    return entry.isFile() ? [{ absolutePath, relativePath, isFile: true }] : [];
  });
}

export function findNoncanonicalCloudPdfCasings(outputDirectory) {
  const violations = [];

  for (const entry of entriesBelow(outputDirectory)) {
    for (const match of noncanonicalMatches(entry.relativePath)) {
      violations.push(`${entry.relativePath}: path contains ${JSON.stringify(match[0])}`);
    }
    if (!entry.isFile) continue;

    const contents = decodeTextFile(entry.absolutePath);
    if (contents == null) continue;
    const inspectedContents = /\.md(?:own)?$/i.test(entry.relativePath)
      ? maskMarkdownLinkDestinations(contents)
      : contents;
    for (const match of noncanonicalMatches(inspectedContents)) {
      const line = inspectedContents.slice(0, match.index).split('\n').length;
      violations.push(
        `${entry.relativePath}:${line}: contains noncanonical casing ${JSON.stringify(match[0])}`,
      );
    }
  }

  return violations;
}

export function assertCanonicalCloudPdfCasing(outputDirectory) {
  const violations = findNoncanonicalCloudPdfCasings(outputDirectory);
  if (violations.length === 0) return;

  const displayed = violations.slice(0, 20).map((violation) => `- ${violation}`);
  if (violations.length > displayed.length) {
    displayed.push(`- ...and ${violations.length - displayed.length} more`);
  }
  throw new Error(
    `Generated SDK contains noncanonical CloudPDF casing. Allowed forms: ${[
      ...ALLOWED_CASINGS,
    ].join(', ')}\n${displayed.join('\n')}`,
  );
}
