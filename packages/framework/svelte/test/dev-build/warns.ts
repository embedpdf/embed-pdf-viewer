// A page that warns once, for `dev-build.test.ts` to bundle.
import { devWarn } from '../../src/runtime/dev';

devWarn('dev-build', 'warned');
