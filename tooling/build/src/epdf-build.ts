#!/usr/bin/env -S node --experimental-strip-types
import { build } from 'tsdown';
import { presetConfig } from './preset.ts';

await build(presetConfig());
