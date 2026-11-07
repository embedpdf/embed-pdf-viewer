import { describe, expect, it } from 'vitest';

import { treeKeyAction, type TreeKeyRow } from '../src/tree-keys';

const row = (depth: number, hasChildren = false, expanded = false): TreeKeyRow => ({
  depth,
  hasChildren,
  expanded,
});

/**
 *   0 A (expanded)
 *   1   A1
 *   2   A2 (collapsed)
 *   3 B
 *   4 C (collapsed)
 */
const ROWS = [row(0, true, true), row(1), row(1, true), row(0), row(0, true)];

describe('treeKeyAction', () => {
  it('moves up and down, and to either end, staying put at the edges', () => {
    expect(treeKeyAction(ROWS, 1, 'ArrowDown')).toEqual({ type: 'focus', row: 2 });
    expect(treeKeyAction(ROWS, 1, 'ArrowUp')).toEqual({ type: 'focus', row: 0 });
    expect(treeKeyAction(ROWS, 2, 'Home')).toEqual({ type: 'focus', row: 0 });
    expect(treeKeyAction(ROWS, 2, 'End')).toEqual({ type: 'focus', row: 4 });
    expect(treeKeyAction(ROWS, 4, 'ArrowDown')).toBeNull();
    expect(treeKeyAction(ROWS, 0, 'ArrowUp')).toBeNull();
  });

  it('opens a collapsed parent with ArrowRight, and goes into an open one', () => {
    expect(treeKeyAction(ROWS, 2, 'ArrowRight')).toEqual({ type: 'expand', rows: [2] });
    expect(treeKeyAction(ROWS, 0, 'ArrowRight')).toEqual({ type: 'focus', row: 1 });
    expect(treeKeyAction(ROWS, 1, 'ArrowRight')).toBeNull();
  });

  it('closes an open parent with ArrowLeft, and otherwise goes to the parent', () => {
    expect(treeKeyAction(ROWS, 0, 'ArrowLeft')).toEqual({ type: 'collapse', row: 0 });
    expect(treeKeyAction(ROWS, 2, 'ArrowLeft')).toEqual({ type: 'focus', row: 0 });
    expect(treeKeyAction(ROWS, 3, 'ArrowLeft')).toBeNull();
  });

  it('expands every collapsed sibling with *', () => {
    expect(treeKeyAction(ROWS, 3, '*')).toEqual({ type: 'expand', rows: [4] });
    expect(treeKeyAction(ROWS, 1, '*')).toEqual({ type: 'expand', rows: [2] });
    expect(treeKeyAction([row(0, true, true), row(1)], 0, '*')).toBeNull();
  });

  it('activates with Enter, and edits with F2 and Delete only when editable', () => {
    expect(treeKeyAction(ROWS, 3, 'Enter')).toEqual({ type: 'activate', row: 3 });
    expect(treeKeyAction(ROWS, 3, 'F2')).toBeNull();
    expect(treeKeyAction(ROWS, 3, 'Delete')).toBeNull();
    expect(treeKeyAction(ROWS, 3, 'F2', { editable: true })).toEqual({ type: 'rename', row: 3 });
    expect(treeKeyAction(ROWS, 3, 'Delete', { editable: true })).toEqual({
      type: 'delete',
      row: 3,
    });
  });

  it('picks a first row for a moving key when none is focused, and ignores other keys', () => {
    expect(treeKeyAction(ROWS, -1, 'ArrowDown')).toEqual({ type: 'focus', row: 0 });
    expect(treeKeyAction(ROWS, -1, 'End')).toEqual({ type: 'focus', row: 4 });
    expect(treeKeyAction(ROWS, -1, 'Enter')).toBeNull();
    expect(treeKeyAction(ROWS, 1, 'a')).toBeNull();
    expect(treeKeyAction([], 0, 'ArrowDown')).toBeNull();
  });
});
