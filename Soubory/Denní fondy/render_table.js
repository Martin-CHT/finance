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