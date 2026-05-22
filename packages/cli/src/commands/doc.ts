import { Command } from 'commander';
import { findDoc, listDocs } from '../lib/manifest';
import { fetchDocContent } from '../lib/fetch';

export function registerDocCommand(program: Command) {
  program
    .command('doc [path]')
    .description('Fetch and display a documentation page')
    .option('--json', 'Output as JSON')
    .option('--list', 'List all available doc pages')
    .option('--framework <framework>', 'Filter by framework (react, vue, svelte)')
    .option('--section <section>', 'Filter by section (headless, viewer, snippet, engines, pdfium)')
    .action(
      async (
        docPath: string | undefined,
        opts: {
          json?: boolean;
          list?: boolean;
          framework?: string;
          section?: string;
        },
      ) => {
        if (opts.list) {
          const docs = listDocs({
            framework: opts.framework,
            section: opts.section,
          });

          if (opts.json) {
            console.log(JSON.stringify(docs, null, 2));
            return;
          }

          if (docs.length === 0) {
            console.log('No docs found matching the given filters.');
            return;
          }

          console.log(`\nFound ${docs.length} doc(s):\n`);
          for (const doc of docs) {
            const meta = [doc.framework, doc.section].filter(Boolean).join('/');
            console.log(`  ${doc.path}`);
            console.log(`    ${doc.title}${meta ? ` (${meta})` : ''}`);
            console.log();
          }
          return;
        }

        if (!docPath) {
          console.error('Error: Please provide a doc path, or use --list to see available pages.');
          console.error('Example: embedpdf doc react/headless/getting-started');
          process.exit(1);
        }

        const entry = findDoc(docPath);
        if (!entry) {
          console.error(`Error: Doc not found: "${docPath}"`);
          console.error('Use "embedpdf doc --list" to see available pages.');
          process.exit(1);
        }

        console.error(`Fetching: ${entry.url}\n`);

        const content = await fetchDocContent(docPath);
        if (!content) {
          console.error(`Error: Could not fetch doc content from GitHub.`);
          process.exit(1);
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                path: entry.path,
                title: entry.title,
                description: entry.description,
                url: entry.url,
                framework: entry.framework,
                section: entry.section,
                content,
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(content);
      },
    );
}
