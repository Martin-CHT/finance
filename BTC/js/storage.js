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
  // ─── Multi-strategy ───
  // Každá strategie je pojmenovaná konfigurace s vlastním plánem a historií.
  // Sdílí se settings a customAssets. plan/investments na top-levelu jsou aliasy
  // na aktuálně aktivní strategii (kvůli zpětné kompatibilitě se zbytkem app.js).
  strategies: [],
  activeStrategyId: null,
};

function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

/* Čte AI klíče sdílené s ostatními moduly Finance Terminalu */
function readSharedKey(name) {
  try { const ls = localStorage.getItem(name); if (ls) return ls; } catch (_) {}
  try {
    const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
    if (m) return decodeURIComponent(m.split('=')[1]);
  } catch (_) {}
  return '';
}

/* Migrace: pokud nejsou strategie, vytvoříme z plan + investments
   defaultní strategii „BTC Smart DCA". Po migraci jsou plan a investments
   aliasy na strategies[active]. */
function migrate(state) {
  if (!Array.isArray(state.strategies)) state.strategies = [];
  if (state.strategies.length === 0) {
    state.strategies.push({
      id: uid('strat'),
      label: 'BTC Smart DCA',
      asset: 'bitcoin',
      plan: state.plan || null,
      investments: Array.isArray(state.investments) ? state.investments : [],
      sensitivity: (state.settings && state.settings.sensitivity) || 1.5,
      createdAt: new Date().toISOString().slice(0,10),
    });
    state.activeStrategyId = state.strategies[0].id;
  }
  // Pokud aktivní strategie chybí nebo je neplatná, vezmeme první.
  if (!state.activeStrategyId || !state.strategies.find(s => s.id === state.activeStrategyId)) {
    state.activeStrategyId = state.strategies[0].id;
  }
  // Synchronizuj top-level pro zpětnou kompatibilitu
  const active = state.strategies.find(s => s.id === state.activeStrategyId);
  if (active) {
    state.plan = active.plan;
    state.investments = active.investments;
    if (typeof active.sensitivity === 'number') state.settings.sensitivity = active.sensitivity;
  }
  return state;
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
    migrate(merged);
    if (!merged.settings.groqKey)   merged.settings.groqKey   = readSharedKey('groq_api_key');
    if (!merged.settings.geminiKey) merged.settings.geminiKey = readSharedKey('gemini_api_key');
    return merged;
  } catch (err) {
    console.error('storage.load failed', err);
    return structuredClone(defaultState);
  }
}

/* Před uložením synchronizuj aktivní strategii s top-level plan/investments,
   protože zbytek app.js manipuluje s nimi přímo. */
export function save(state) {
  try {
    if (Array.isArray(state.strategies) && state.activeStrategyId) {
      const i = state.strategies.findIndex(s => s.id === state.activeStrategyId);
      if (i >= 0) {
        state.strategies[i].plan = state.plan;
        state.strategies[i].investments = state.investments;
        state.strategies[i].sensitivity = state.settings.sensitivity;
      }
    }
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('storage.save failed', err);
  }
}

/* Strategy management */
export function listStrategies(state) {
  return Array.isArray(state.strategies) ? state.strategies : [];
}
export function getActiveStrategy(state) {
  return state.strategies.find(s => s.id === state.activeStrategyId) || null;
}
export function switchStrategy(state, id) {
  const s = state.strategies.find(x => x.id === id);
  if (!s) return false;
  // Uložíme aktuální top-level zpět do staré strategie (před přepnutím)
  const oldActive = state.strategies.find(x => x.id === state.activeStrategyId);
  if (oldActive) {
    oldActive.plan = state.plan;
    oldActive.investments = state.investments;
    oldActive.sensitivity = state.settings.sensitivity;
  }
  // Přepneme
  state.activeStrategyId = id;
  state.plan = s.plan;
  state.investments = s.investments;
  if (typeof s.sensitivity === 'number') state.settings.sensitivity = s.sensitivity;
  return true;
}
export function createStrategy(state, label, opts = {}) {
  const newS = {
    id: uid('strat'),
    label: label || ('Strategie ' + (state.strategies.length + 1)),
    asset: opts.asset || 'bitcoin',
    plan: opts.plan || null,
    investments: [],
    sensitivity: typeof opts.sensitivity === 'number' ? opts.sensitivity : 1.5,
    createdAt: new Date().toISOString().slice(0,10),
  };
  state.strategies.push(newS);
  return newS;
}
export function renameStrategy(state, id, newLabel) {
  const s = state.strategies.find(x => x.id === id);
  if (s) s.label = (newLabel || '').trim() || s.label;
}
export function deleteStrategy(state, id) {
  if (state.strategies.length <= 1) return false; // poslední strategii nemažeme
  state.strategies = state.strategies.filter(s => s.id !== id);
  if (state.activeStrategyId === id) {
    state.activeStrategyId = state.strategies[0].id;
    const a = state.strategies[0];
    state.plan = a.plan;
    state.investments = a.investments;
  }
  return true;
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
  const merged = { ...structuredClone(defaultState), ...parsed };
  migrate(merged);
  save(merged);
}
