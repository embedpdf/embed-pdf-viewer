/**
 * `.sql` files are imported as their raw text content. Wiring:
 *   - tsup:   `loader: { '.sql': 'text' }` in tsup.config.ts
 *   - vitest: `sqlAsTextPlugin` in vitest.config.ts
 *
 * Both pipelines turn `import sql from './foo.sql'` into a string at
 * build/transform time, so there is no runtime filesystem dependency
 * on the original .sql files.
 */
declare module '*.sql' {
  const content: string;
  export default content;
}
