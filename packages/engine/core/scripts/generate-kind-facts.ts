/**
 * Writes `src/annotation/kind-facts.generated.ts` from the annotation kind declarations
 * (`src/annotation/kinds/<kind>/declaration.ts`): `pnpm --filter @embedpdf/engine-core generate`.
 * `test/annotation/kind-facts.test.ts` renders it again and fails when the file differs.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ColorSchema } from '../src/annotation/base.schema';
import type { AnyField } from '../src/annotation/declaration';
import { ANNOTATION_DECLARATIONS } from '../src/annotation/kinds/declarations';

/** Where the facts are written. */
export const KIND_FACTS_FILE = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../src/annotation/kind-facts.generated.ts',
);

const quoted = (text: string) => `'${text}'`;
const keyOf = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : quoted(name));
const listOf = (names: readonly string[]) => `[${names.map(quoted).join(', ')}]`;
const recordOf = (entries: ReadonlyArray<readonly [string, string]>, indent: string) =>
  entries.length === 0
    ? '{}'
    : `{\n${entries.map(([name, value]) => `${indent}  ${keyOf(name)}: ${quoted(value)},`).join('\n')}\n${indent}}`;

/** The generated file's text, from the declarations as they are. */
export function renderKindFacts(): string {
  const kinds = ANNOTATION_DECLARATIONS.map((declaration) => {
    const fields = Object.entries(declaration.fields as Record<string, AnyField>);
    const names = (keep: (field: AnyField) => boolean) =>
      fields.filter(([, field]) => keep(field)).map(([name]) => name);
    const owners = fields.map(([name, field]) => [name, field.traits.owner] as const);
    const spaces = fields
      .filter(([, field]) => field.traits.space !== 'none')
      .map(([name, field]) => [name, field.traits.space] as const);
    const resources = Object.entries(declaration.resources as Record<string, string>);
    return [
      `  ${keyOf(declaration.subtype)}: {`,
      `    owners: ${recordOf(owners, '    ')},`,
      `    readBack: ${listOf(names((field) => field.traits.readBack))},`,
      `    colors: ${listOf(names((field) => field.read === ColorSchema))},`,
      `    spaces: ${recordOf(spaces, '    ')},`,
      `    resources: ${recordOf(resources, '    ')},`,
      '  },',
    ].join('\n');
  });
  return [
    '// Generated from the annotation kind declarations (`kinds/<kind>/declaration.ts`) by',
    '// `scripts/generate-kind-facts.ts`; `test/annotation/kind-facts.test.ts` fails when this file',
    '// is out of date. Not edited by hand: `pnpm --filter @embedpdf/engine-core generate` writes it.',
    '',
    "import type { KindFacts } from './kind-facts';",
    "import type { AnnotationSubtype } from './subtype';",
    '',
    "/** Each annotation kind's {@link KindFacts}, in the engine's catalog order. */",
    'export const ANNOTATION_KIND_FACTS: Readonly<Record<AnnotationSubtype, KindFacts>> = {',
    ...kinds,
    '};',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(KIND_FACTS_FILE, renderKindFacts());
  console.log(`[generate] ${KIND_FACTS_FILE}`);
}
