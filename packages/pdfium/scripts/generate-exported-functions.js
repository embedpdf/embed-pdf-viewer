import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { functions } from './exported-functions.js';

// Get current directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extraFunctions = ['malloc', 'free'];
const funcNames = Object.keys(functions);

const names = [...extraFunctions, ...funcNames]
  .map((funcName) => {
    return '_' + funcName;
  })
  .join(',');

fs.writeFileSync(path.join(__dirname, '../build/exported-functions.txt'), names, {
  encoding: 'utf-8',
});

const defintion = `
export const functions = {
${funcNames
  .map((funcName) => {
    const args = functions[funcName][0];
    const ret = functions[funcName][1];
    return `  ${funcName}: [${JSON.stringify(args)} as const, ${ret === null ? 'null' : "'" + ret + "'"}] as const`;
  })
  .join(',\n')}
}
`;

fs.writeFileSync(path.join(__dirname, '../src/functions.ts'), defintion, {
  encoding: 'utf-8',
});
