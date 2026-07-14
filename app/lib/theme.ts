import { useSyncExternalStore } from 'react';

const THEME_KEY = 'cbt_theme';
const THEME_EVENT = 'cbt:theme-change';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

const isDarkSnapshot = () => document.documentElement.classList.contains('dark');
const isDarkServerSnapshot = () => false;

/**
 * Read and toggle the light/dark theme. The active theme lives on the
 * document element (applied by an inline script in the layout before paint to
 * avoid a flash), so it is exposed here as an external store rather than React
 * state.
 */
export function useTheme() {
  const isDark = useSyncExternalStore(subscribe, isDarkSnapshot, isDarkServerSnapshot);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return { isDark, toggle };
}
