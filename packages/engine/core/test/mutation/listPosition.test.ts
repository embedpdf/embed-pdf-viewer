import { describe, expect, test } from 'vitest';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { positionIndex, reorderPart, reorderedList } from '../../src/mutation/ListPosition';

const key = (item: string) => item;

describe('positionIndex', () => {
  test('a neighbour stands for its own index or the next; start and end for the ends', () => {
    const order = ['a', 'b', 'c'];
    expect(positionIndex(order, 'start', key)).toBe(0);
    expect(positionIndex(order, 'end', key)).toBe(3);
    expect(positionIndex(order, { before: 'b' }, key)).toBe(1);
    expect(positionIndex(order, { after: 'b' }, key)).toBe(2);
  });

  test('refuses a neighbour that is not in the list', () => {
    expect(() => positionIndex(['a'], { after: 'z' }, key)).toThrow(
      expect.objectContaining({ code: EngineErrorCode.NotFound }),
    );
  });
});

describe('reorderedList', () => {
  const order = ['a', 'b', 'c', 'd'];

  test('the rows go together, in the order given, next to the neighbour', () => {
    expect(reorderedList(order, ['a'], { after: 'c' }, key)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderedList(order, ['d', 'a'], { before: 'c' }, key)).toEqual(['b', 'd', 'a', 'c']);
    expect(reorderedList(order, ['c', 'a'], 'start', key)).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderedList(order, ['a'], 'end', key)).toEqual(['b', 'c', 'd', 'a']);
  });

  test('refuses a row named twice or a neighbour that moves (InvalidArg), and a row not in the list (NotFound)', () => {
    expect(() => reorderedList(order, ['a', 'a'], 'end', key)).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
    expect(() => reorderedList(order, ['a', 'b'], { after: 'b' }, key)).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
    expect(() => reorderedList(order, ['z'], 'end', key)).toThrow(
      expect.objectContaining({ code: EngineErrorCode.NotFound }),
    );
  });
});

describe('reorderPart', () => {
  test('one part takes the order given, in its own slots; the rest keep their places', () => {
    // Two pages' rows, interleaved: page 1's are the upper-case ones.
    const list = ['A', 'x', 'B', 'y', 'C'];
    const onPage = (item: string) => item === item.toUpperCase();
    expect(reorderPart(list, onPage, ['C', 'A', 'B'], key)).toEqual(['C', 'x', 'A', 'y', 'B']);
  });

  test('what the order leaves out follows what it names', () => {
    const list = ['A', 'B', 'C'];
    expect(reorderPart(list, () => true, ['C', 'Z'], key)).toEqual(['C', 'A', 'B']);
  });
});
