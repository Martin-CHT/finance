
        lucide.createIcons();

        // ── Globální stav ──────────────────────────────────────────
        let pricesData = [];      // [{ date, f1, f2, ..., f10 }]
        let inflationData = [];   // [{ yearMonth, inflation_pa }]
        let activeFondy = [];     // pole aktivních fondů z konfigurace
        let chartInstance = null;
        let currentRange = '1M';
        let collapsedMonths = new Set();
        let backfillRunning = false;

        // ── Inicializace ─────────────────────────────────────────
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
        }

        // ── Načtení dat z GAS ──────────────────────────────────
        async function loadAllData() {
            setDataStatus('Načítám…');
            showToast('Načítám data z Google Sheets…', 'info');
            try {
                const url = DENNI_FONDY_CONFIG.gasUrl + '?action=getAll';
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const json = await resp.json();

                if (json.error) throw new Error(json.error);

                // Aktualizovat productId v konfiguraci ze Sheetu
                if (json.config && Array.isArray(json.config)) {
                    json.config.forEach(c => {
                        const local = DENNI_FONDY_CONFIG.fondy.find(f => f.id === c.id);
                        if (local) local.productId = c.productId || local.productId;
                    });
                    activeFondy = DENNI_FONDY_CONFIG.fondy.filter(f => f.active && f.slug);
                }

                pricesData = (json.prices || []).sort((a, b) => b.date.localeCompare(a.date));
                inflationData = json.inflation || [];

                renderAll();
                setDataStatus(`${pricesData.length} záznamů · poslední: ${pricesData[0]?.date || '—'}`);
                showToast('Data načtena', 'success');
            } catch (err) {
                console.error('loadAllData error:', err);
                showToast('Chyba načítání: ' + err.message, 'error', 6000);
                renderEmptyState('Nepodařilo se načíst data. Zkontrolujte GAS URL a oprávnění.');
            }
        }

        // ── Synchronizace konfigurace ──────────────────────────
        async function syncConfig() {
            const gasUrl = DENNI_FONDY_CONFIG.gasUrl;
            if (!gasUrl || gasUrl.includes('SEM_VLOZ')) {
                showSyncStatus('❌ Nejprve nastavte gasUrl v fondy-config.js', 'error');
                return;
            }

            document.getElementById('btnSync').disabled = true;
            document.getElementById('btnSync').innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Synchronizuji…';
            lucide.createIcons();
            showSyncStatus('⏳ Odesílám konfiguraci na GAS…', 'info');

            try {
                const payload = { action: 'syncConfig', fondy: activeFondy };
                const resp = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                const json = await resp.json();
                if (json.error) throw new Error(json.error);

                // Aktualizovat productIds
                if (json.fondy) {
                    json.fondy.forEach(c => {
                        const local = DENNI_FONDY_CONFIG.fondy.find(f => f.id === c.id);
                        if (local && c.productId) local.productId = c.productId;
                    });
                }

                let msg = '✅ Synchronizace dokončena.\n';
                if (json.fondy) {
                    msg += json.fondy.filter(f => f.active).map(f =>
                        `  ${f.name}: productId = ${f.productId || '❌ nenalezeno'}`
                    ).join('\n');
                }
                showSyncStatus(msg, 'success');
                showToast('Synchronizace dokončena', 'success');
            } catch (err) {
                showSyncStatus('❌ Chyba: ' + err.message, 'error');
                showToast('Chyba synchronizace', 'error');
            } finally {
                document.getElementById('btnSync').disabled = false;
                document.getElementById('btnSync').innerHTML = '<i data-lucide="upload-cloud" class="w-3.5 h-3.5"></i> Synchronizovat';
                lucide.createIcons();
            }
        }

        function showSyncStatus(msg, type) {
            const el = document.getElementById('syncStatus');
            el.classList.remove('hidden');
            el.style.color = type === 'error' ? '#fb7185' : type === 'success' ? '#4ade80' : '#94a3b8';
            el.textContent = msg;
        }

        // ── Backfill ─────────────────────────────────────────
        async function startBackfill() {
            const gasUrl = DENNI_FONDY_CONFIG.gasUrl;
            if (!gasUrl || gasUrl.includes('SEM_VLOZ')) {
                showToast('Nejprve nastavte gasUrl', 'error'); return;
            }
            if (backfillRunning) return;

            const selectedIds = Array.from(document.querySelectorAll('.backfill-fund-cb:checked')).map(cb => cb.value);
            const fundsToFill = activeFondy.filter(f => f.productId && selectedIds.includes(f.id));
            
            if (fundsToFill.length === 0) {
                showToast('Vyberte alespoň jeden fond', 'warn');
                return;
            }
            
            document.getElementById('backfillProgress').classList.remove('hidden');
            if (fundsToFill.length === 0) {
                showToast('Nejdříve synchronizujte fondy (GAS potřebuje zjistit productId)', 'warn', 5000);
                return;
            }

            backfillRunning = true;
            document.getElementById('btnBackfillStart').disabled = true;
            document.getElementById('btnBackfillStart').innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Probíhá…';
            lucide.createIcons();

            const progressEl = document.getElementById('backfillProgress');
            progressEl.innerHTML = '';

            // Vykreslit progress bary
            fundsToFill.forEach(f => {
                const div = document.createElement('div');
                div.className = 'fund-progress pending';
                div.id = `bp-${f.id}`;
                div.innerHTML = `
                    <div class="dot"></div>
                    <span class="flex-1" style="color:#94a3b8">${f.name}</span>
                    <span class="text-[10px] font-mono" id="bp-status-${f.id}" style="color:#475569">čekám…</span>
                `;
                progressEl.appendChild(div);
            });

            let totalLoaded = 0;
            let errors = 0;

            for (const fond of fundsToFill) {
                const row = document.getElementById(`bp-${fond.id}`);
                const statusEl = document.getElementById(`bp-status-${fond.id}`);
                row.className = 'fund-progress running';
                statusEl.textContent = 'stahuje se…';
                statusEl.style.color = '#38bdf8';

                try {
                    const years = document.getElementById('backfillYears').value || 1;
                    const url = `${gasUrl}?action=backfillFund&fundId=${fond.id}&years=${years}`;
                    const resp = await fetch(url);
                    const json = await resp.json();

                    if (json.error) throw new Error(json.error);

                    const count = json.count || 0;
                    totalLoaded += count;
                    row.className = 'fund-progress done';
                    statusEl.textContent = `✓ ${count} záznamů`;
                    statusEl.style.color = '#4ade80';
                } catch (err) {
                    errors++;
                    row.className = 'fund-progress error';
                    // Zobrazit skutečnou chybovou zprávu (max 60 znaků)
                    const errMsg = err.message || 'neznámá chyba';
                    statusEl.textContent = '✗ ' + errMsg.substring(0, 60);
                    statusEl.style.color = '#fb7185';
                    console.error(`Backfill error for ${fond.id}:`, err.message);
                }
            }

            const summary = document.getElementById('backfillSummary');
            summary.classList.remove('hidden');
            summary.innerHTML = errors === 0
                ? `<span class="text-emerald-400">✓ Hotovo! Načteno ${totalLoaded} denních kurzů pro ${fundsToFill.length} fondů.</span>`
                : `<span class="text-amber-400">Dokončeno s ${errors} chybami. Načteno ${totalLoaded} záznamů.</span>`;

            backfillRunning = false;
            document.getElementById('btnBackfillStart').disabled = false;
            document.getElementById('btnBackfillStart').innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Znovu';
            lucide.createIcons();

            // Reload dat
            await loadAllData();
        }

        // ── Vykreslení hlavičky tabulky ────────────────────
        function renderTableHead() {
            const thead = document.getElementById('tableHead');
            let html = '<tr>';
            html += '<th class="px-2 py-2 font-semibold sticky-corner align-bottom min-w-[80px]">Datum</th>';
            activeFondy.forEach(f => {
                html += `<th class="px-2 py-2 font-semibold text-right sticky-header align-bottom price-cell">
                    <a href="https://www.conseq.cz/investice/prehled-fondu/${f.slug}" target="_blank"
                       class="table-link flex-wrap justify-end" style="color:${f.color}">
                        ${escHtml(f.name)}<i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                    </a>
                </th>`;
            });
            html += `<th class="px-2 py-2 font-semibold text-right sticky-header align-bottom" style="color:#fb7185">
                <a href="https://data.csu.gov.cz/datastat/data/VYBER/CEN0101HT02?vSel=1" target="_blank"
                   class="table-link !text-rose-400 hover:!text-rose-300 flex-wrap justify-end">
                    Inflace (p.a.)<i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                </a>
            </th>`;
            html += '</tr>';
            thead.innerHTML = html;
            lucide.createIcons();
        }

        // ── Vykreslení tabulky ─────────────────────────────
        function renderTable() {
            const tbody = document.getElementById('tableBody');
            if (!pricesData.length) {
                tbody.innerHTML = `<tr><td colspan="${activeFondy.length + 2}" class="px-3 py-8 text-center text-slate-500">
                    Žádná data. Klikněte „Načíst historii" pro stažení historických kurzů.
                </td></tr>`;
                return;
            }

            // Grupování po měsících
            const grouped = {};
            pricesData.forEach((row, idx) => {
                const ym = row.date.substring(0, 7);
                if (!grouped[ym]) grouped[ym] = [];
                grouped[ym].push({ row, prev: pricesData[idx + 1] || null });
            });

            const months = Object.keys(grouped).sort().reverse();
            let html = '';

            months.forEach(ym => {
                const isCollapsed = collapsedMonths.has(ym);
                const label = formatYM(ym);
                const count = grouped[ym].length;

                // Měsíční záhlaví
                html += `<tr class="bg-slate-800/80 hover:bg-slate-700/80 transition-colors cursor-pointer border-y border-slate-700"
                             onclick="toggleMonth('${ym}')">
                    <td colspan="${activeFondy.length + 2}" class="px-2 py-1.5 font-bold text-slate-200 sticky left-0 z-10 bg-slate-800/90 text-xs">
                        <div class="flex items-center gap-1.5">
                            <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" class="w-3.5 h-3.5 text-teal-400"></i>
                            ${label}
                            <span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-[10px]">${count} obchodních dní</span>
                        </div>
                    </td>
                </tr>`;

                if (isCollapsed) return;

                // Inflace pro tento měsíc
                const infRecord = inflationData.find(i => i.yearMonth === ym);
                const infVal = infRecord ? infRecord.inflation_pa : null;

                grouped[ym].forEach(({ row, prev }, dayIdx) => {
                    const isLastDayOfMonth = dayIdx === 0; // první v seřazeném desc = poslední datum
                    html += '<tr class="hover:bg-slate-800/50 transition-colors group">';
                    html += `<td class="px-2 py-1 border-r border-slate-800 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors text-slate-300 font-sans font-medium text-[11px]">${formatDate(row.date)}</td>`;

                    activeFondy.forEach(f => {
                        const val = row[f.id];
                        const prevVal = prev ? prev[f.id] : null;
                        html += `<td class="px-2 py-1 text-right">${formatPriceCell(val, prevVal, f.color)}</td>`;
                    });

                    // Inflace — zobrazí jen pro první řádek v měsíci (= nejnovější datum)
                    if (isLastDayOfMonth && infVal !== null && infVal !== undefined) {
                        html += `<td class="px-2 py-1 text-right text-rose-400 font-mono text-xs" title="Roční inflace ČNB pro ${label}">
                            ${infVal.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                        </td>`;
                    } else {
                        html += `<td class="px-2 py-1 text-right"><span class="text-slate-700">—</span></td>`;
                    }

                    html += '</tr>';
                });
            });

            tbody.innerHTML = html;
            lucide.createIcons();
        }

        function formatPriceCell(val, prevVal, color) {
            if (val === null || val === undefined || val === '') {
                return '<span class="text-slate-700">—</span>';
            }
            const price = Number(val);
            const priceStr = price.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

            let diffHtml = '<span class="text-slate-500">—</span>';
            if (prevVal !== null && prevVal !== undefined && prevVal !== '') {
                const prev = Number(prevVal);
                if (prev > 0) {
                    const pct = ((price - prev) / prev) * 100;
                    const sign = pct >= 0 ? '+' : '';
                    const cls = pct > 0.01 ? 'price-diff-pos' : pct < -0.01 ? 'price-diff-neg' : 'price-diff-neu';
                    diffHtml = `<span class="${cls} font-bold text-[13px]">${sign}${pct.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</span>`;
                }
            }

            return `<div class="price-cell flex flex-col items-end">
                <div>${diffHtml}</div>
                <div class="text-[10px] opacity-70 mt-0.5 font-mono" style="color:${color}">${priceStr} CZK</div>
            </div>`;
        }

        // ── Grafy ──────────────────────────────────────────
        function renderChart() {
            const ctx = document.getElementById('priceChart').getContext('2d');

            const cutoff = getRangeCutoff(currentRange);
            const filtered = cutoff
                ? pricesData.filter(r => r.date >= cutoff).reverse()
                : [...pricesData].reverse();

            if (!filtered.length) {
                if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
                return;
            }

            const labels = filtered.map(r => formatDateShort(r.date));

            // Normalizovat na 100 od prvního dne
            const datasets = activeFondy.map(f => {
                const raw = filtered.map(r => (r[f.id] !== null && r[f.id] !== undefined) ? Number(r[f.id]) : null);
                const firstVal = raw.find(v => v !== null);
                const normalized = raw.map(v => v !== null && firstVal ? (v / firstVal) * 100 : null);
                return {
                    label: f.name,
                    data: normalized,
                    borderColor: f.color,
                    backgroundColor: f.color + '18',
                    borderWidth: 2,
                    pointRadius: filtered.length > 60 ? 0 : 2,
                    pointHoverRadius: 4,
                    tension: 0.15,
                    spanGaps: true,
                    fill: false,
                    tooltip_raw: raw
                };
            });

            if (chartInstance) chartInstance.destroy();

            Chart.defaults.color = '#94a3b8';
            Chart.defaults.font.family = "'JetBrains Mono', monospace";
            Chart.defaults.font.size = 10;

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { font: { family: "'Inter', sans-serif", size: 10 }, usePointStyle: true, boxWidth: 6, padding: 10 }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: '#334155', borderWidth: 1,
                            titleFont: { family: "'Inter', sans-serif", size: 11 },
                            bodyFont: { family: "'JetBrains Mono', monospace", size: 10 },
                            padding: 8, cornerRadius: 6,
                            callbacks: {
                                label: function (ctx) {
                                    const norm = ctx.parsed.y;
                                    if (norm === null) return null;
                                    const rawArr = ctx.dataset.tooltip_raw;
                                    const raw = rawArr ? rawArr[ctx.dataIndex] : null;
                                    let label = ctx.dataset.label + ': ';
                                    label += norm.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    if (raw !== null) {
                                        label += ' (index)  |  ' + raw.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' CZK';
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            ticks: { callback: v => v.toFixed(1) }
                        },
                        x: {
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            ticks: { maxTicksLimit: 12 }
                        }
                    }
                }
            });
        }

        function getRangeCutoff(range) {
            const now = new Date();
            if (range === '1M') { now.setMonth(now.getMonth() - 1); return now.toISOString().split('T')[0]; }
            if (range === '3M') { now.setMonth(now.getMonth() - 3); return now.toISOString().split('T')[0]; }
            if (range === '6M') { now.setMonth(now.getMonth() - 6); return now.toISOString().split('T')[0]; }
            if (range === '1R') { now.setFullYear(now.getFullYear() - 1); return now.toISOString().split('T')[0]; }
            return null;
        }

        function setRange(range) {
            currentRange = range;
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`range-${range}`)?.classList.add('active');
            renderChart();
        }

        // ── KPI ────────────────────────────────────────────
        function renderKPIs() {
            const today = pricesData[0];
            const yesterday = pricesData[1];
            if (!today) return;

            let best = null, worst = null;
            activeFondy.forEach(f => {
                const val = today[f.id];
                const prev = yesterday ? yesterday[f.id] : null;
                if (val === null || val === undefined) return;
                if (prev === null || prev === undefined || prev === 0) return;
                const pct = ((Number(val) - Number(prev)) / Number(prev)) * 100;

                if (best === null || pct > best.pct) best = { ...f, pct };
                if (worst === null || pct < worst.pct) worst = { ...f, pct };
            });

            if (best) {
                document.getElementById('kpiBest').textContent = (best.pct >= 0 ? '+' : '') + best.pct.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
                document.getElementById('kpiBestName').textContent = best.name + ' · ' + formatDate(today.date);
            }
            if (worst) {
                document.getElementById('kpiWorst').textContent = (worst.pct >= 0 ? '+' : '') + worst.pct.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
                document.getElementById('kpiWorstName').textContent = worst.name + ' · ' + formatDate(today.date);
            }

            // 30D volatilita
            const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; })();
            const last30 = pricesData.filter(r => r.date >= cutoff).slice().reverse();

            let allVols = [];
            activeFondy.forEach(f => {
                const vals = last30.map(r => r[f.id]).filter(v => v !== null && v !== undefined);
                if (vals.length < 2) return;
                const changes = [];
                for (let i = 1; i < vals.length; i++) {
                    changes.push(((Number(vals[i]) - Number(vals[i - 1])) / Number(vals[i - 1])) * 100);
                }
                const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
                const variance = changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length;
                allVols.push(Math.sqrt(variance));
            });

            if (allVols.length > 0) {
                const avgVol = allVols.reduce((a, b) => a + b, 0) / allVols.length;
                document.getElementById('kpiVolatility').textContent = avgVol.toLocaleString('cs-CZ', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' %';
            }
        }

        // ── Měsíční group toggle ───────────────────────────
        function toggleMonth(ym) {
            if (collapsedMonths.has(ym)) collapsedMonths.delete(ym);
            else collapsedMonths.add(ym);
            renderTable();
        }

        function toggleAllMonths() {
            const months = [...new Set(pricesData.map(r => r.date.substring(0, 7)))];
            if (collapsedMonths.size > 0) {
                collapsedMonths.clear();
            } else {
                months.forEach(ym => collapsedMonths.add(ym));
            }
            renderTable();
            const btn = document.getElementById('textToggleMonths');
            const icon = document.getElementById('iconToggleMonths');
            if (btn && icon) {
                if (collapsedMonths.size === 0) {
                    btn.textContent = 'Sbalit vše';
                    icon.setAttribute('data-lucide', 'fold-vertical');
                } else {
                    btn.textContent = 'Rozbalit vše';
                    icon.setAttribute('data-lucide', 'unfold-vertical');
                }
            }
            lucide.createIcons();
        }

        // ── Render all ──────────────────────────────────────
        function renderAll() {
            renderTableHead();
            renderTable();
            renderChart();
            renderKPIs();
        }

        function renderEmptyState(msg) {
            document.getElementById('tableBody').innerHTML = `<tr><td colspan="${activeFondy.length + 2}" class="px-3 py-8 text-center text-slate-500 text-xs">${escHtml(msg)}</td></tr>`;
        }

        // ── Sync modal helpers ─────────────────────────────
        function renderSyncModal() {
            const list = document.getElementById('syncFondyList');
            list.innerHTML = activeFondy.map(f => `
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background:${f.color}"></span>
                    <span class="text-slate-300">${escHtml(f.name)}</span>
                    <span class="text-slate-600 font-mono text-[10px] truncate">${escHtml(f.slug)}</span>
                </div>
            `).join('');
        }

        // ── Modal helpers ──────────────────────────────────
        function openSyncModal() { renderSyncModal(); showModal('syncModal'); }
        function openBackfillModal() {
            document.getElementById('backfillProgress').innerHTML = '';
            document.getElementById('backfillProgress').classList.add('hidden');
            
            const selEl = document.getElementById('backfillFundSelection');
            if (selEl) {
                const validFunds = activeFondy.filter(f => f.productId);
                if (validFunds.length === 0) {
                    selEl.innerHTML = '<div class="text-rose-400">Nejprve synchronizujte fondy.</div>';
                } else {
                    selEl.innerHTML = validFunds.map(f => `
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-1 rounded transition-colors">
                            <input type="checkbox" class="backfill-fund-cb rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-sky-500" value="${f.id}" checked>
                            <span>${f.name}</span>
                        </label>
                    `).join('');
                }
            }
            
            document.getElementById('backfillSummary').classList.add('hidden');
            document.getElementById('btnBackfillStart').disabled = false;
            document.getElementById('btnBackfillStart').innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> Spustit načítání';
            lucide.createIcons();
            showModal('backfillModal');
        }
        function openAIModal() {
            resetAIModal();
            switchAiProvider(getCookieVal('ai_provider') || 'groq');
            showModal('aiModal');
            lucide.createIcons();
        }
        function openHelpModal() {
            if (!window.FinanceCommon?.help) { alert('Nápověda není k dispozici.'); return; }
            window.FinanceCommon.help.show({
                title: 'Denní Fondy Conseq',
                subtitle: 'Automatické sledování denních kurzů s AI analýzou a predikcí',
                sections: [
                    {
                        kind: 'intro', heading: '🎯 K čemu modul slouží',
                        body: '<p>Modul automaticky stahuje denní kurzy fondů z webu Conseq a ukládá je do Google Sheets. Zobrazuje historický vývoj absolutních kurzů v CZK včetně denních procentuálních změn.</p>'
                    },
                    {
                        kind: 'steps', heading: '📝 Prvotní nastavení',
                        body: '<ol><li>Nasaďte Google Apps Script (kód najdete v nápovědě).</li><li>Vložte GAS URL do souboru <b>fondy-config.js</b>.</li><li>Klikněte <b>Synchronizovat fondy</b> — GAS zjistí productId pro každý fond.</li><li>Klikněte <b>Načíst historii</b> pro první načtení dat.</li><li>GAS poté každý den automaticky stahuje nové kurzy.</li></ol>'
                    },
                    {
                        kind: 'features', heading: '✨ Funkce',
                        body: '<ul><li><b>Denní kurzy</b> v CZK + barevná procentuální změna oproti předchozímu dni.</li><li><b>Normalizovaný graf</b> pro srovnání výkonnosti všech fondů na stejné ose.</li><li><b>AI Analýza</b> — 3 fáze: volatilita, geopolitický kontext, predikce na příští měsíc.</li><li><b>Inflace ČNB</b> jako měsíční hodnota.</li><li>Automatické denní aktualizace bez nutnosti ručního zásahu.</li></ul>'
                    },
                    {
                        kind: 'tips', heading: '💡 Jak přidat nový fond',
                        body: '<ol><li>Otevřete soubor <code>fondy-config.js</code>.</li><li>Zkopírujte slug z URL fondu na webu Conseq.</li><li>Vyplňte volný slot (f7–f10) a nastavte <code>active: true</code>.</li><li>Klikněte <b>Synchronizovat fondy</b>.</li></ol>'
                    }
                ]
            });
        }

        function showModal(id) {
            const modal = document.getElementById(id);
            const content = document.getElementById(id + 'Content');
            modal.classList.remove('hidden');
            setTimeout(() => { modal.classList.remove('opacity-0'); content?.classList.remove('scale-95'); }, 10);
        }
        function closeModal(id) {
            const modal = document.getElementById(id);
            const content = document.getElementById(id + 'Content');
            modal.classList.add('opacity-0');
            content?.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }

        // ── AI Analýza ─────────────────────────────────────
        function switchAiProvider(provider) {
            setCookieVal('ai_provider', provider);
            const groqBtn = document.getElementById('btnAiGroq');
            const geminiBtn = document.getElementById('btnAiGemini');
            if (provider === 'groq') {
                groqBtn.className = 'px-2 py-1 rounded bg-purple-600 text-white font-medium transition-colors';
                geminiBtn.className = 'px-2 py-1 rounded text-slate-400 hover:text-white transition-colors';
            } else {
                groqBtn.className = 'px-2 py-1 rounded text-slate-400 hover:text-white transition-colors';
                geminiBtn.className = 'px-2 py-1 rounded bg-blue-600 text-white font-medium transition-colors';
            }
        }

        function resetAIModal() {
            ['aiPhase1', 'aiPhase2', 'aiPhase3'].forEach(id => {
                document.getElementById(id).className = 'ai-phase pending';
            });
            document.getElementById('aiWelcome').classList.remove('hidden');
            document.getElementById('aiOutput').classList.add('hidden');
            document.getElementById('aiOutput').innerHTML = '';
            document.getElementById('aiError').classList.add('hidden');
            document.getElementById('btnAnalyze').disabled = false;
        }

        function setPhaseState(phaseId, state) {
            document.getElementById(phaseId).className = `ai-phase ${state}`;
        }

        async function runAIAnalysis() {
            const provider = getCookieVal('ai_provider') || 'groq';
            const apiKey = provider === 'groq' ? getCookieVal('groq_api_key') : getCookieVal('gemini_api_key');
            if (!apiKey) {
                document.getElementById('aiError').classList.remove('hidden');
                document.getElementById('aiError').textContent = `❌ Chybí ${provider === 'groq' ? 'Groq' : 'Gemini'} API klíč. Nastavte ho v Nastavení.`;
                document.getElementById('aiWelcome').classList.add('hidden');
                return;
            }

            document.getElementById('btnAnalyze').disabled = true;
            document.getElementById('aiWelcome').classList.add('hidden');
            document.getElementById('aiOutput').classList.remove('hidden');
            document.getElementById('aiOutput').innerHTML = '';
            document.getElementById('aiError').classList.add('hidden');

            try {
                // ── FÁZE 1: Výpočet volatility ──────────────
                setPhaseState('aiPhase1', 'running');

                const now = new Date();
                const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(now.getMonth() - 6);
                const sixMoStr = sixMonthsAgo.toISOString().split('T')[0];

                const last6M = pricesData.filter(r => r.date >= sixMoStr).slice().reverse();

                const volatilityData = activeFondy.map(f => {
                    const vals = last6M.map(r => r[f.id]).filter(v => v !== null && v !== undefined).map(Number);
                    if (vals.length < 5) return { name: f.name, vol: null, change: null };
                    const changes = [];
                    for (let i = 1; i < vals.length; i++) {
                        changes.push(((vals[i] - vals[i - 1]) / vals[i - 1]) * 100);
                    }
                    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
                    const variance = changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length;
                    const vol = Math.sqrt(variance);
                    const totalChange = vals.length > 0 ? ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100 : null;
                    return { name: f.name, vol: vol.toFixed(3), change: totalChange?.toFixed(2) };
                });

                setPhaseState('aiPhase1', 'done');
                await sleep(300);

                // ── FÁZE 2: Geopolitická analýza ─────────────
                setPhaseState('aiPhase2', 'running');

                const dateFromStr = sixMonthsAgo.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'long' });
                const dateToStr = now.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'long' });

                const volSummary = volatilityData.map(v =>
                    `  • ${v.name}: denní volatilita ${v.vol ?? 'N/A'} %, celková změna za 6M: ${v.change ?? 'N/A'} %`
                ).join('\n');

                const prompt2 = `Jsi expert na investice a geopolitiku. Odpovídej VÝHRADNĚ v češtině.

VOLATILITA FONDŮ (za posledních 6 měsíců, ${dateFromStr} – ${dateToStr}):
${volSummary}

ÚKOL – odpověz ve dvou částech:

**ČÁST A: GEOPOLITICKÝ KONTEXT (posledních 6 měsíců)**
Stručně (max. 6 bodů) vyjmenuj nejvýznamnější geopolitické události z období ${dateFromStr} – ${dateToStr}, které mohly ovlivnit globální finanční trhy. Pro každou událost uveď, jak pravděpodobně ovlivnila konkrétní sledované fondy (World Fund, Amundi Silver Age, Nová Evropa, Dluhopisový, Vyvážený, Realitní).

**ČÁST B: AKTUÁLNÍ SITUACE (poslední měsíc)**
Na základě aktuální geopolitické a makroekonomické situace (k ${dateToStr}) a výše uvedené volatility fondů:
1. Který fond byl nejvíce zasažen geopolitickými riziky a proč?
2. Který fond prokázal největší odolnost?
3. Jaké jsou aktuální klíčové rizikové faktory pro příští měsíc?

Buď konkrétní, věcný, bez obecných frází. Markdown **tučně** pro klíčová slova.`;

                const systemInst = 'Jsi finanční analytik specializovaný na česky dostupné podílové fondy a geopolitické rizikové faktory. Odpovídáš pouze česky, profesionálně, věcně.';

                let phase2Result = '';
                if (provider === 'gemini') {
                    phase2Result = await callGemini(prompt2, systemInst, apiKey);
                } else {
                    phase2Result = await callGroq(prompt2, systemInst, apiKey);
                }

                appendAISection('🌍 Geopolitický kontext & analýza', phase2Result);
                setPhaseState('aiPhase2', 'done');
                await sleep(500);

                // ── FÁZE 3: Predikce ─────────────────────────
                setPhaseState('aiPhase3', 'running');

                const nextMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

                const prompt3 = `Jsi investiční analytik. Odpovídej VÝHRADNĚ v češtině.

Na základě předchozí analýzy geopolitické situace a dat o volatilitě fondů Conseq, vytvoř predikci pro ${nextMonthStr}:

FONDY K PREDIKCI:
${volatilityData.map(v => `  • ${v.name} (volatilita: ${v.vol ?? 'N/A'} %, 6M výkonnost: ${v.change ?? 'N/A'} %)`).join('\n')}

Pro každý fond uveď:
1. **Predikovaný trend**: Růst / Pokles / Stabilní (s odůvodněním max. 2 věty)
2. **Klíčové riziko**: Co může predikci změnit?
3. **Doporučení**: Zvýšit/udržet/snížit alokaci?

Na závěr: **Celkové portfolio** — jak se chovat v příštím měsíci?

Buď konkrétní. Žádné obecné rady. Markdown **tučně** pro klíčová slova.`;

                let phase3Result = '';
                if (provider === 'gemini') {
                    phase3Result = await callGemini(prompt3, systemInst, apiKey);
                } else {
                    phase3Result = await callGroq(prompt3, systemInst, apiKey);
                }

                appendAISection(`🔮 Predikce fondů — ${nextMonthStr}`, phase3Result);
                setPhaseState('aiPhase3', 'done');

            } catch (err) {
                document.getElementById('aiError').classList.remove('hidden');
                document.getElementById('aiError').textContent = '❌ Chyba: ' + err.message;
                ['aiPhase1', 'aiPhase2', 'aiPhase3'].forEach(id => {
                    if (document.getElementById(id).className.includes('running')) {
                        document.getElementById(id).className = 'ai-phase error';
                    }
                });
            } finally {
                document.getElementById('btnAnalyze').disabled = false;
            }
        }

        function appendAISection(title, markdown) {
            const out = document.getElementById('aiOutput');
            const div = document.createElement('div');
            div.className = 'border border-slate-800 rounded-lg p-3 bg-slate-950/30';
            div.innerHTML = `<h3 class="text-sm font-bold text-slate-200 mb-2">${escHtml(title)}</h3>${parseMarkdown(markdown)}`;
            out.appendChild(div);
        }

        async function callGroq(prompt, system, apiKey) {
            const url = 'https://api.groq.com/openai/v1/chat/completions';
            const payload = {
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
                max_tokens: 2048
            };
            for (let i = 0; i < 3; i++) {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify(payload)
                });
                if (res.ok) return (await res.json()).choices?.[0]?.message?.content || '';
                if (res.status === 401) throw new Error('Neplatný Groq API klíč.');
                if (res.status === 429) {
                    if (i === 2) throw new Error('Překročen limit Groq API.');
                    await sleep(parseInt(res.headers.get('Retry-After') || '30', 10) * 1000);
                    continue;
                }
                throw new Error(`Chyba Groq API: ${res.status}`);
            }
        }

        async function callGemini(prompt, system, apiKey) {
            const model = 'gemini-2.5-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            const payload = {
                contents: [{ role: 'user', parts: [{ text: `${system}\n\n${prompt}` }] }],
                generationConfig: { maxOutputTokens: 2048 }
            };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(payload)
            });
            if (res.ok) return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (res.status === 401) throw new Error('Neplatný Gemini API klíč.');
            throw new Error(`Chyba Gemini API: ${res.status}`);
        }

        // ── Utility funkce ─────────────────────────────────
        function parseMarkdown(text) {
            if (!text) return '';
            return text
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/^#{3}\s+(.+)$/gm, '<h3 style="font-size:0.85rem;font-weight:600;color:#e2e8f0;margin:0.75rem 0 0.35rem">$1</h3>')
                .replace(/^#{2}\s+(.+)$/gm, '<h3 style="font-size:0.9rem;font-weight:700;color:#f1f5f9;margin:1rem 0 0.4rem">$1</h3>')
                .replace(/^[-•]\s+(.+)$/gm, '<li style="margin-bottom:0.2rem">$1</li>')
                .replace(/(<li[^>]*>.*<\/li>\n?)+/gs, m => `<ul style="padding-left:1.2rem;margin:0.3rem 0">${m}</ul>`)
                .replace(/\n{2,}/g, '</p><p style="margin-bottom:0.5rem">')
                .replace(/\n/g, '<br>')
                .replace(/^(.+)$/, '<p style="margin-bottom:0.5rem">$1');
        }

        function formatDate(dateStr) {
            if (!dateStr) return '—';
            const d = new Date(dateStr + 'T12:00:00');
            return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        function formatDateShort(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr + 'T12:00:00');
            return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
        }
        function formatYM(ym) {
            const [y, m] = ym.split('-');
            const d = new Date(parseInt(y), parseInt(m) - 1, 1);
            return d.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
        }
        function escHtml(s) {
            return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function setDataStatus(msg) {
            document.getElementById('dataStatus').textContent = msg;
        }
        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        function setCookieVal(name, value) {
            const exp = new Date(Date.now() + 365 * 86400000).toUTCString();
            document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + exp + '; path=/; SameSite=Lax';
        }
        function getCookieVal(name) {
            const pairs = document.cookie.split('; ');
            for (const p of pairs) {
                if (p.startsWith(name + '=')) return decodeURIComponent(p.slice(name.length + 1));
            }
            return '';
        }

        function showToast(message, type = 'info', duration = 3000) {
            const toast = document.getElementById('toast');
            const msgEl = document.getElementById('toastMessage');
            const iconEl = document.getElementById('toastIcon');
            msgEl.textContent = message;
            const icons = { success: 'check-circle', error: 'alert-circle', info: 'info', warn: 'alert-triangle' };
            const colors = { success: 'text-emerald-400', error: 'text-rose-400', info: 'text-sky-400', warn: 'text-amber-400' };
            iconEl.innerHTML = `<i data-lucide="${icons[type]}" class="w-4 h-4 ${colors[type]}"></i>`;
            lucide.createIcons();
            toast.classList.remove('translate-y-20', 'opacity-0');
            setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), duration);
        }

        // ── Start ──────────────────────────────────────────
        window.addEventListener('load', init);
    