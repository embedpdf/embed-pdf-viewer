import { Command } from 'commander';
import { searchDocs } from '../lib/search';

export function registerSearchCommand(program: Command) {
  program
    .command('search-docs <query>')
    .description('Search EmbedPDF documentation')
    .option('--json', 'Output as JSON (for LLM consumption)')
    .option('--framework <framework>', 'Filter by framework (react, vue, svelte)')
    .option('--section <section>', 'Filter by section (headless, viewer, snippet, engines, pdfium)')
    .option('--limit <n>', 'Maximum number of results', '5')
    .action(
      async (
        query: string,
        opts: {
          json?: boolean;
          framework?: string;
          section?: string;
          limit: string;
        },
      ) => {
        const limit = parseInt(opts.limit, 10);

        const results = await searchDocs(query, {
          framework: opts.framework,
          section: opts.section,
          limit,
        });

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        if (results.total === 0) {
          console.log(`No results found for "${query}".`);
          return;
        }

        console.log(`\nFound ${results.total} result(s) for "${query}":\n`);

        for (let i = 0; i < results.results.length; i++) {
          const r = results.results[i];
          const num = String(i + 1).padStart(2, ' ');
          const meta = [r.framework, r.section].filter(Boolean).join('/');
          console.log(`  ${num}. ${r.title}${meta ? ` (${meta})` : ''}`);
          console.log(`      ${r.description}`);
          console.log(`      ${r.url}`);
          console.log();
        }
      },
    );
}
