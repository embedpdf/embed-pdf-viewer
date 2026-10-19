// A page that warns once, for `dev-build.test.ts` to bundle.
import { devWarn } from '../../src/dev';

devWarn('dev-build', 'warned');
