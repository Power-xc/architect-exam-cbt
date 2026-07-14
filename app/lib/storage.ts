import { StorageData, ExamResult } from '../types';
import { MAX_RESULT_HISTORY } from './constants';

const KEY = 'cbt_data_v1';

const empty = (): StorageData => ({ results: [], wrongPool: [], bookmarks: [] });

export function loadStorage(): StorageData {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

function save(data: StorageData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

/**
 * Merge a session's outcome into the running wrong-answer pool: newly missed
 * questions are added, questions answered correctly this time are cleared.
 * Pure, so it can be unit tested without a DOM.
 */
export function mergeWrongPool(current: string[], wrongIds: string[], passedIds: string[]): string[] {
  const pool = new Set(current);
  wrongIds.forEach((id) => pool.add(id));
  passedIds.forEach((id) => pool.delete(id));
  return [...pool];
}

/** Persist a completed result and reconcile the wrong-answer pool. */
export function saveResult(result: ExamResult, passedIds: string[] = []) {
  const data = loadStorage();
  data.results = [result, ...data.results].slice(0, MAX_RESULT_HISTORY);
  data.wrongPool = mergeWrongPool(data.wrongPool, result.wrongIds, passedIds);
  save(data);
}

export function removeFromWrongPool(ids: string[]) {
  const data = loadStorage();
  data.wrongPool = mergeWrongPool(data.wrongPool, [], ids);
  save(data);
}

export function clearAll() {
  localStorage.removeItem(KEY);
}
