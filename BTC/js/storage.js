const KEY = 'btc-invest:v1';

const defaultState = {
  plan: null,
  investments: [],
  settings: {
    groqKey: '',
    groqModel: 'llama-3.3-70b-versatile',
    geminiKey: '',
    geminiModel: 'gemini-2.5-flash',
    displayCurrency: 'USD',
    sensitivity: 1.5,
  },
  customAssets: [],
};

/* Čte AI klíče sdílené s ostatními moduly Finance Terminalu
   (groq_api_key, gemini_api_key) z localStorage nebo cookies. */
function readSharedKey(name) {
  try {
    const ls = localStorage.getItem(name);
    if (ls) return ls;
  } catch (_) { /* ignore */ }
  try {
    const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
    if (m) return decodeURIComponent(m.split('=')[1]);
  } catch (_) { /* ignore */ }
  return '';
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const base = raw ? JSON.parse(raw) : {};
    const merged = {
      ...structuredClone(defaultState),
      ...base,
      settings: { ...defaultState.settings, ...(base.settings || {}) },
    };
    // Fallback na sdílené klíče z globálního Nastavení Finance Terminalu
    if (!merged.settings.groqKey)   merged.settings.groqKey   = readSharedKey('groq_api_key');
    if (!merged.settings.geminiKey) merged.settings.geminiKey = readSharedKey('gemini_api_key');
    return merged;
  } catch (err) {
    console.error('storage.load failed', err);
    return structuredClone(defaultState);
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('storage.save failed', err);
  }
}

export function clearAll() {
  localStorage.removeItem(KEY);
}

export function exportJSON() {
  const state = load();
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid JSON');
  save({ ...structuredClone(defaultState), ...parsed });
}
