import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJsonPath = resolve(import.meta.dirname, '..', 'dist', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

packageJson.types = './types/embedpdf-angular-pdf-viewer.d.ts';
packageJson.typings = 'types/embedpdf-angular-pdf-viewer.d.ts';
packageJson.files = ['fesm2022', 'types', 'README.md'];

delete packageJson.publishConfig;

writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
