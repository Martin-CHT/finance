import codecs

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Add Funds Management Modal HTML
modal_html = """
    <!-- Funds Manager Modal -->
    <div id="fundsManagerModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm hidden opacity-0 transition-opacity duration-300">
        <div id="fundsManagerModalContent" class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden scale-95 transition-transform duration-300 mx-4 max-h-[90vh] flex flex-col">
            <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                <div class="flex items-center gap-2">
                    <i data-lucide="settings-2" class="w-5 h-5 text-indigo-400"></i>
                    <h2 class="text-base font-semibold text-slate-100">Správa portfolia (Cloud)</h2>
                </div>
                <button onclick="closeModal('fundsManagerModal')" class="text-slate-400 hover:text-white transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="p-5 flex-1 overflow-y-auto custom-scrollbar">
                <div class="text-sm text-slate-400 mb-4">Zde můžete přidávat nové fondy z webu Conseq nebo mazat stávající. Data se ukládají přímo do Google Sheets.</div>
                
                <div id="fmList" class="space-y-3">
                    <!-- Dynamicky generováno JS -->
                </div>

                <button onclick="fmAddFund()" class="mt-4 w-full py-2 border border-dashed border-slate-600 rounded text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                    <i data-lucide="plus" class="w-4 h-4"></i> Přidat další fond
                </button>
            </div>
            <div class="px-5 py-4 border-t border-slate-800 bg-slate-800/30 flex items-center justify-between">
                <div id="fmStatus" class="text-xs font-mono text-emerald-400 hidden"></div>
                <div class="flex gap-3 ml-auto">
                    <button onclick="closeModal('fundsManagerModal')" class="px-4 py-2 rounded font-medium text-sm text-slate-300 hover:text-white transition-colors">Zrušit</button>
                    <button id="btnFmSave" onclick="fmSaveConfig()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded font-medium text-sm transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/50">
                        <i data-lucide="save" class="w-4 h-4"></i> Uložit do cloudu
                    </button>
                </div>
            </div>
        </div>
    </div>
"""

html = html.replace('<!-- Modals: backfillModal, aiModal, syncModal -->', '<!-- Modals: backfillModal, aiModal, syncModal -->\n' + modal_html)
if modal_html not in html:
    html = html.replace('</body>', modal_html + '\n</body>')

# 2. Add Management logic in JS
fm_js = """
        // ── Správa Fondů (Cloud) ───────────────────────────
        let fmDraft = [];

        function openFundsManager() {
            // Inicializace draftu
            fmDraft = JSON.parse(JSON.stringify(DENNI_FONDY_CONFIG.fondy)); // Fallback
            // Pokud máme načtená cloudová data, použijeme je jako základ
            if (activeFondy.length > 0) {
                // Sjednotíme to, co máme aktuálně aktivní nebo i neaktivní
                fmDraft = [...activeFondy];
            }
            renderFmList();
            document.getElementById('fmStatus').classList.add('hidden');
            showModal('fundsManagerModal');
            lucide.createIcons();
        }

        function renderFmList() {
            const list = document.getElementById('fmList');
            list.innerHTML = fmDraft.map((f, i) => 
                <div class="bg-slate-800/50 border border-slate-700 p-3 rounded-lg flex items-start gap-4">
                    <div class="flex-1 space-y-2">
                        <div class="flex gap-2">
                            <input type="text" value="" onchange="fmUpdate(, 'name', this.value)" placeholder="Název fondu (např. World Fund)" class="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200">
                            <input type="color" value="" onchange="fmUpdate(, 'color', this.value)" class="w-8 h-8 rounded cursor-pointer bg-slate-900 border border-slate-600 p-0">
                        </div>
                        <input type="text" value="" onchange="fmUpdate(, 'slug', this.value)" placeholder="Slug z URL (např. ff-world-fund-hedged-czk)" class="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400 font-mono">
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                            <input type="checkbox"  onchange="fmUpdate(, 'active', this.checked)" class="rounded bg-slate-900 border-slate-600 text-indigo-500 focus:ring-indigo-500">
                            Aktivní
                        </label>
                        <button onclick="fmRemove()" class="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1 transition-colors mt-2" title="Odstranit fond">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Smazat
                        </button>
                    </div>
                </div>
            ).join('');
            lucide.createIcons();
        }

        function fmUpdate(index, field, value) {
            fmDraft[index][field] = value;
            if (field === 'slug') fmDraft[index].productId = null; // reset productId při změně slugu
        }

        function fmRemove(index) {
            if(confirm('Opravdu chcete tento fond odebrat ze seznamu?')) {
                fmDraft.splice(index, 1);
                renderFmList();
            }
        }

        function fmAddFund() {
            fmDraft.push({
                id: 'f' + Date.now().toString().slice(-6),
                name: '',
                slug: '',
                color: '#38bdf8',
                active: true,
                productId: null
            });
            renderFmList();
        }

        async function fmSaveConfig() {
            const gasUrl = DENNI_FONDY_CONFIG.gasUrl;
            if (!gasUrl || gasUrl.includes('SEM_VLOZ')) {
                alert('Nejprve nastavte gasUrl v fondy-config.js'); return;
            }
            
            // Validace
            for (let i=0; i<fmDraft.length; i++) {
                if (fmDraft[i].active && (!fmDraft[i].name || !fmDraft[i].slug)) {
                    alert('Všechny aktivní fondy musí mít vyplněný Název i Slug.');
                    return;
                }
            }

            const btn = document.getElementById('btnFmSave');
            const status = document.getElementById('fmStatus');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Ukládám…';
            lucide.createIcons();

            try {
                const payload = { action: 'saveConfig', fondy: fmDraft };
                const resp = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                const json = await resp.json();
                
                status.textContent = '✓ Uloženo do cloudu';
                status.classList.remove('hidden');
                
                // Nyní rovnou spustíme syncConfig, aby se načetla nová productIds!
                status.textContent = '✓ Uloženo, zjišťuji ID z Consequ...';
                await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'syncConfig', fondy: fmDraft })
                });

                setTimeout(() => {
                    closeModal('fundsManagerModal');
                    loadAllData(); // Reload celý dashboard
                }, 1500);

            } catch (err) {
                status.textContent = '❌ Chyba: ' + err.message;
                status.classList.remove('hidden');
                status.classList.add('text-rose-400');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Uložit do cloudu';
                lucide.createIcons();
            }
        }
"""

html = html.replace('// ── Měsíční group toggle', fm_js + '\n        // ── Měsíční group toggle')

# 3. Add button to the top header in HTML
old_header = """                <button onclick="openSyncModal()"
                    class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-700">
                    <i data-lucide="upload-cloud" class="w-3.5 h-3.5"></i> Synchronizace fondy
                </button>"""

new_header = """                <button onclick="openFundsManager()"
                    class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 shadow-lg shadow-indigo-900/20">
                    <i data-lucide="settings-2" class="w-3.5 h-3.5"></i> Správa portfolia
                </button>
                <button onclick="openSyncModal()"
                    class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-700" title="Synchronizovat IDs s webem Conseq">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> ID Sync
                </button>"""

html = html.replace(old_header, new_header)

# 4. Modify init() and loadAllData() to use the new cloud config
old_init = """        // ── Inicializace ─────────────────────────────────────────
        function init() {
            activeFondy = DENNI_FONDY_CONFIG.fondy.filter(f => f.active && f.slug);
            renderTableHead();
            renderSyncModal();

            const gasUrl = DENNI_FONDY_CONFIG.gasUrl;
            if (!gasUrl || gasUrl.includes('SEM_VLOZ') || gasUrl.length < 20) {
                showToast('⚠️ Vložte URL Google Apps Script do fondy-config.js', 'warn', 8000);
                renderEmptyState('Nejprve nastavte gasUrl v souboru fondy-config.js, pak klikněte Synchronizovat fondy.');
                return;
            }
            loadAllData();
        }"""

new_init = """        // ── Inicializace ─────────────────────────────────────────
        function init() {
            activeFondy = DENNI_FONDY_CONFIG.fondy.filter(f => f.active && f.slug);
            renderTableHead();
            renderSyncModal();

            const gasUrl = DENNI_FONDY_CONFIG.gasUrl;
            if (!gasUrl || gasUrl.includes('SEM_VLOZ') || gasUrl.length < 20) {
                showToast('⚠️ Vložte URL Google Apps Script do fondy-config.js', 'warn', 8000);
                renderEmptyState('Nejprve nastavte gasUrl v souboru fondy-config.js, pak zahajte Správu portfolia.');
                return;
            }
            loadAllData();
        }"""

html = html.replace(old_init, new_init)


old_load2 = """                // Aktualizovat productId v konfiguraci ze Sheetu
                if (json.config && Array.isArray(json.config)) {
                    json.config.forEach(c => {
                        const local = DENNI_FONDY_CONFIG.fondy.find(f => f.id === c.id);
                        if (local) local.productId = c.productId || local.productId;
                    });
                    activeFondy = DENNI_FONDY_CONFIG.fondy.filter(f => f.active && f.slug);
                }"""

new_load2 = """                // Aktualizovat fondy kompletně ze Sheetu
                if (json.config && Array.isArray(json.config) && json.config.length > 0) {
                    activeFondy = json.config.filter(f => f.active && f.slug);
                } else {
                    activeFondy = DENNI_FONDY_CONFIG.fondy.filter(f => f.active && f.slug);
                }"""

html = html.replace(old_load2, new_load2)


with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("UI successfully added!")
