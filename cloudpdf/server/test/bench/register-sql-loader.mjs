/**
 * tsx has no `.sql`-as-text transform (tsup and the Vitest plugin each
 * provide their own), so bench runs register this ESM loader:
 *
 *   node --import tsx --import ./test/bench/register-sql-loader.mjs <script>
 */
import { register } from 'node:module';

register(new URL('./sql-text-loader.mjs', import.meta.url));
