import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

const LANGUAGE_NAMES = Object.freeze({
  typescript: 'TypeScript',
  python: 'Python',
  php: 'PHP',
  csharp: '.NET',
  go: 'Go',
  java: 'Java',
  ruby: 'Ruby',
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSdkReadme(readme, language) {
  const languageName = LANGUAGE_NAMES[language];
  if (!languageName) throw new Error(`Unsupported SDK language ${language}`);

  const generatedLanguageName = language === 'csharp' ? 'C#' : languageName;
  const escapedGeneratedLanguageName = escapeRegExp(generatedLanguageName);
  const expectedTitle = `# CloudPDF ${languageName} SDK`;
  const lines = readme.split('\n');
  const generatedTitle = new RegExp(`^# Cloud(?:pdf|Pdf) ${escapedGeneratedLanguageName} Library$`);
  if (lines[0] !== expectedTitle && !generatedTitle.test(lines[0])) {
    throw new Error(`${language}: generated README title format changed`);
  }
  lines[0] = expectedTitle;

  const generatedDescription = new RegExp(
    `^The Cloud(?:pdf|Pdf) ${escapedGeneratedLanguageName} library provides convenient access to the Cloud(?:pdf|Pdf) APIs from ${escapedGeneratedLanguageName}\\.$`,
  );
  const descriptionIndex = lines.findIndex((line) => generatedDescription.test(line));
  const officialDescription = `The official ${languageName} SDK for the CloudPDF API.`;
  if (descriptionIndex === -1 && !lines.includes(officialDescription)) {
    throw new Error(`${language}: generated README description format changed`);
  }
  if (descriptionIndex !== -1) lines[descriptionIndex] = officialDescription;

  return normalizeMarkdownCodeIdentifiers(lines.join('\n'), language);
}

function normalizeCodeIdentifiers(code, language) {
  let normalized = code.replaceAll(/Cloud(?:pdf|Pdf)/g, 'CloudPDF');
  if (language === 'ruby') {
    normalized = normalized.replaceAll('require "CloudPDF"', 'require "cloudpdf"');
  }
  return normalized;
}

function normalizeMarkdownCodeIdentifiers(markdown, language) {
  let fenceMarker = null;
  return markdown
    .split('\n')
    .map((line) => {
      const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence != null) {
        if (fenceMarker == null) fenceMarker = fence[0];
        else if (fence[0] === fenceMarker) fenceMarker = null;
        return line;
      }
      if (fenceMarker != null) return normalizeCodeIdentifiers(line, language);
      return line.replace(/(`+)([^`]*?)\1/g, (_match, ticks, code) => {
        return `${ticks}${normalizeCodeIdentifiers(code, language)}${ticks}`;
      });
    })
    .join('\n');
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function renameCaseAware(source, destination) {
  if (!existsSync(source)) {
    if (existsSync(destination)) return;
    throw new Error(`Expected generated file ${source}`);
  }
  const temporary = `${source}.cloudpdf-normalizing`;
  renameSync(source, temporary);
  renameSync(temporary, destination);
}

function normalizePhpExceptions(outputDirectory) {
  const sourceDirectory = `${outputDirectory}/src`;
  for (const path of filesBelow(outputDirectory)) {
    if (path.endsWith('/.php-cs-fixer.cache')) {
      unlinkSync(path);
      continue;
    }
    if (!statSync(path).isFile() || !path.endsWith('.php')) continue;
    const source = readFileSync(path, 'utf8');
    const normalized = source
      .replaceAll('CloudpdfApiException', 'CloudPDFApiException')
      .replaceAll('CloudpdfException', 'CloudPDFException');
    if (normalized !== source) writeFileSync(path, normalized);
  }

  renameCaseAware(
    `${sourceDirectory}/Exceptions/CloudpdfApiException.php`,
    `${sourceDirectory}/Exceptions/CloudPDFApiException.php`,
  );
  renameCaseAware(
    `${sourceDirectory}/Exceptions/CloudpdfException.php`,
    `${sourceDirectory}/Exceptions/CloudPDFException.php`,
  );
}

function normalizeRubyPackage(outputDirectory) {
  renameCaseAware(`${outputDirectory}/CloudPDF.gemspec`, `${outputDirectory}/cloudpdf.gemspec`);
  renameCaseAware(`${outputDirectory}/lib/CloudPDF.rb`, `${outputDirectory}/lib/cloudpdf.rb`);

  const gemspecPath = `${outputDirectory}/cloudpdf.gemspec`;
  const gemspec = readFileSync(gemspecPath, 'utf8').replace(
    'spec.name = "CloudPDF"',
    'spec.name = "cloudpdf"',
  );
  if (!gemspec.includes('spec.name = "cloudpdf"')) {
    throw new Error('ruby: generated gemspec package-name format changed');
  }
  writeFileSync(gemspecPath, gemspec);
}

export function normalizeSdkBranding(outputDirectory, language) {
  if (language === 'php') normalizePhpExceptions(outputDirectory);
  if (language === 'ruby') normalizeRubyPackage(outputDirectory);

  const readmePath = `${outputDirectory}/README.md`;
  const readme = readFileSync(readmePath, 'utf8');
  writeFileSync(readmePath, normalizeSdkReadme(readme, language));
}
