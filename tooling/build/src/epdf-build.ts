#!/usr/bin/env -S node --experimental-strip-types
import { build } from 'tsdown';
import { assertCommonJsHoldsThem } from './bundle-in-cjs.mjs';
import { presetConfig } from './preset.ts';

await build(presetConfig());
assertCommonJsHoldsThem(process.cwd());
