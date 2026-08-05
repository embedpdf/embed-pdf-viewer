import { Command } from 'commander';
import { registerDocCommand } from './commands/doc';
import { registerSearchCommand } from './commands/search';

const program = new Command();

program.name('embedpdf').description('The official CLI for the EmbedPDF project').version('2.14.3');

registerDocCommand(program);
registerSearchCommand(program);

program.parse();
