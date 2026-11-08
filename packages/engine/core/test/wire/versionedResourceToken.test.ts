import { describe, expect, test } from 'vitest';

import {
  decodeActionsToken,
  decodeAnnotationToken,
  decodeLayoutToken,
  encodeActionsToken,
  encodeAnnotationToken,
  encodeLayoutToken,
} from '../../src/wire/tokens';
import { SHAPES, tokenPinOf } from '../../src/wire/cachedReads';

const pin = { engine: '9f2c41aa', shape: 1 };

describe('versioned resource tokens', () => {
  test('round-trips each resource version with its engine value and shape', () => {
    expect(encodeLayoutToken({ layoutVersion: 7, pin })).toBe(
      'engine=9f2c41aa,layoutVersion=7,shape=1',
    );
    expect(encodeAnnotationToken(8, pin)).toBe('annotationVersion=8,engine=9f2c41aa,shape=1');
    expect(encodeActionsToken(1, pin)).toBe('actionsVersion=1,engine=9f2c41aa,shape=1');
    expect(decodeLayoutToken(encodeLayoutToken({ layoutVersion: 7, pin }))).toEqual({
      layoutVersion: 7,
      pin,
    });
    expect(decodeAnnotationToken(encodeAnnotationToken(8, pin))).toEqual({
      annotationVersion: 8,
      pin,
    });
    expect(decodeActionsToken(encodeActionsToken(1, pin))).toEqual({ actionsVersion: 1, pin });
  });

  test("a layout token carries the scales' pin when the server keeps one", () => {
    const token = { layoutVersion: 7, viewportsVersion: 3, pin };
    expect(encodeLayoutToken(token)).toBe(
      'engine=9f2c41aa,layoutVersion=7,shape=1,viewportsVersion=3',
    );
    expect(decodeLayoutToken(encodeLayoutToken(token))).toEqual(token);
    expect(() =>
      decodeLayoutToken('engine=9f2c41aa,layoutVersion=7,shape=1,viewportsVersion=0'),
    ).toThrow(/viewportsVersion/);
  });

  test('refuses a token without its engine value or shape', () => {
    expect(() => decodeLayoutToken('layoutVersion=7')).toThrow(/engine/);
    expect(() => decodeLayoutToken('engine=9f2c41aa,layoutVersion=7')).toThrow(/shape/);
    expect(() => decodeLayoutToken('engine=9f2c41aa,layoutVersion=7,shape=0')).toThrow(/shape/);
  });

  test('rejects unknown token fields', () => {
    expect(() =>
      decodeLayoutToken('engine=9f2c41aa,layoutVersion=7,shape=1,unexpected=2'),
    ).toThrow();
    expect(() => decodeAnnotationToken('annotationVersion=8,unexpected=2')).toThrow();
    expect(() => decodeActionsToken('actionsVersion=1,unexpected=2')).toThrow();
  });
});

describe('token pins', () => {
  test("a kind's pin is the server's engine value and this code's shape", () => {
    expect(tokenPinOf('render', { render: 'abc123', text: 'def456' })).toEqual({
      engine: 'abc123',
      shape: SHAPES.render,
    });
  });

  test('a kind the server gave no engine value for is refused', () => {
    expect(() => tokenPinOf('render', { text: 'def456' })).toThrow(/render/);
  });
});
