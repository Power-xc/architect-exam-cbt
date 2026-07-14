import { describe, expect, it } from 'vitest';
import { mergeWrongPool } from './storage';

describe('mergeWrongPool', () => {
  it('adds newly missed questions', () => {
    expect(mergeWrongPool(['a'], ['b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('clears questions answered correctly this time', () => {
    expect(mergeWrongPool(['a', 'b', 'c'], [], ['b'])).toEqual(['a', 'c']);
  });

  it('does not duplicate a question already in the pool', () => {
    expect(mergeWrongPool(['a', 'b'], ['b'], [])).toEqual(['a', 'b']);
  });

  it('applies additions before removals for the same session', () => {
    expect(mergeWrongPool(['a'], ['b'], ['a'])).toEqual(['b']);
  });
});
