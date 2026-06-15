// ==UserScript==
// @name         Amundi Fund Chart Enhancer
// @namespace    http://amundi.cz/
// @version      2.9
// @description  Vytvoří pod grafem na moje.amundi.com tabulku s 5 sloupci (Datum, Změna vkladů, Celkové vklady, Hodnota portfolia, Rozdíl) a vykreslí graf rozdílu.
// @author       Martin
// @copyright    2026, Martin
// @license      Proprietary - internal use only
// @homepageURL  https://github.com/Martin-CHT/web
// @source       https://github.com/Martin-CHT/web
// @supportURL   https://github.com/Martin-CHT/web/issues
// @icon         https://companieslogo.com/img/orig/AMUN.PA-cccbac2f.png
// @icon64       https://companieslogo.com/img/orig/AMUN.PA-cccbac2f.png
// @updateURL    https://github.com/Martin-CHT/web/raw/refs/heads/main/finance/Amundi.fondy.user.js
// @downloadURL  https://github.com/Martin-CHT/web/raw/refs/heads/main/finance/Amundi.fondy.user.js
// @match        https://moje.amundi.com/cz/dashboard*
// @grant        unsafeWindow
// @run-at       document-start
// @tag          Finance
// @tag          AMUNDI
// ==/UserScript==

(function () {
    'use strict';

    // === NETWORK INTERCEPTION ===
    const interceptedData = [];
    const interceptedRawTexts = [];
    
    const origParse = unsafeWindow.JSON.parse;
    unsafeWindow.JSON.parse = function(text, reviver) {
        const res = origParse.call(this, text, reviver);
        if (res && typeof res === 'object') interceptedData.push(res);
        return res;
    };
    
    const origFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = async function(...args) {
        try {
            const response = await origFetch.apply(this, args);
            const clone = response.clone();
            clone.text().then(text => {
                interceptedRawTexts.push(text);
                try { interceptedData.push(origParse(text)); } catch(e) {}
            }).catch(e => {});
            return response;
        } catch(e) {
            return origFetch.apply(this, args);
        }
    };

    const origOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    unsafeWindow.XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener('load', function() {
            try {
                if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') {
                    let data = this.response;
                    if (typeof data === 'string') {
                        interceptedRawTexts.push(data);
                        try { data = origParse(data); } catch(e) {}
                    } else if (data) {
                        try { interceptedRawTexts.push(JSON.stringify(data)); } catch(e) {}
                    }
                    if (data && typeof data === 'object') interceptedData.push(data);
                }
            } catch(e) {}
        });
        origOpen.apply(this, arguments);
    };

    function findDataArrays(root) {
        const results = [];
        const seen = new Set();
        
        function search(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (seen.has(obj)) return;
            seen.add(obj);
            
            if (Array.isArray(obj)) {
                let match = false;
                for (let i = 0; i < obj.length; i++) {
                    const item = obj[i];
                    if (item && typeof item === 'object' && item.value !== undefined && item.valueDate !== undefined) {
                        match = true;
                        break;
                    }
                }
                if (match) {
                    results.push(obj);
                    return; // Nejdeme hlouběji
                }
            }
            
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) search(obj[i]);
            } else {
                for (let key in obj) {
                    try { search(obj[key]); } catch(e) {}
                }
            }
        }
        
        search(root);
        return results;
    }

    let attempts = 0;
    const waitForChart = setInterval(() => {
        attempts++;
        
        const domCharts = document.querySelectorAll('.highcharts-container, svg.highcharts-root');
        
        if (domCharts.length === 0) {
            return;
        }
        
        let allSeries = [];
        
        interceptedData.forEach(data => {
            const found = findDataArrays(data);
            if (found.length > 0) allSeries = allSeries.concat(found);
        });

        if (allSeries.length === 0) {
            interceptedRawTexts.forEach(txt => {
                if (txt && txt.includes('valueDate')) {
                    try {
                        const parsed = origParse(txt);
                        const found = findDataArrays(parsed);
                        if (found.length > 0) allSeries = allSeries.concat(found);
                    } catch(e) {}
                }
            });
        }

        if (allSeries.length === 0) {
            if (attempts > 45) {
                clearInterval(waitForChart);
            }
            return;
        }

        clearInterval(waitForChart);

        try {
            const uniqueSeries = [];
            const seenSigs = new Set();
            for(let s of allSeries) {
                if (s.length === 0) continue;
                const first = s[0];
                const last = s[s.length-1];
                const sig = `${first.valueDate}_${first.value}_${last.valueDate}_${last.value}`;
                if(!seenSigs.has(sig)) {
                    seenSigs.add(sig);
                    uniqueSeries.push(s);
                }
            }

            // === OPRAVA V2.5: Inteligentní výběr sérií ===
            // Pokud máme ve hře více fondů, může API vracet více než 2 řady dat (např. 4 řady).
            // Potřebujeme identifikovat, která je CELKOVÉ portfolio a které CELKOVÉ vklady.
            uniqueSeries.forEach(s => {
                // Najdeme maximální hodnotu v řadě (pro určení "Celku" místo dílčího fondu)
                s.maxVal = Math.max(...s.map(pt => pt.value));
                // Spočítáme poklesy - portfolio jde často dolů, vklady typicky jen nahoru (nebo stojí)
                let drops = 0;
                for(let i=1; i<s.length; i++) {
                    if (s[i].value < s[i-1].value) drops++;
                }
                s.drops = drops;
            });

            // Rozdělíme na volatilní (Portfolio) a stabilní (Vklady)
            const volatileSeries = uniqueSeries.filter(s => s.drops > 5);
            const stableSeries = uniqueSeries.filter(s => s.drops <= 5);

            // Edge-case: pokud by všechny série spadly do jedné škatulky
            if (volatileSeries.length === 0 && stableSeries.length > 1) {
                stableSeries.sort((a,b) => b.drops - a.drops);
                volatileSeries.push(stableSeries.shift());
            } else if (stableSeries.length === 0 && volatileSeries.length > 1) {
                volatileSeries.sort((a,b) => a.drops - b.drops);
                stableSeries.push(volatileSeries.shift());
            }

            // Seřadíme sestupně podle maximální hodnoty (tím vyfiltrujeme dílčí fondy a necháme jen CELKOVÉ částky)
            volatileSeries.sort((a, b) => b.maxVal - a.maxVal);
            stableSeries.sort((a, b) => b.maxVal - a.maxVal);

            let pSeries = volatileSeries.length > 0 ? volatileSeries[0] : uniqueSeries[0];
            let dSeries = stableSeries.length > 0 ? stableSeries[0] : (uniqueSeries.length > 1 ? uniqueSeries[1] : []);

            // --- Sestavení dat pro tabulku ---
            const rawDataByDate = {};
            
            pSeries.forEach(pt => {
                if (!rawDataByDate[pt.valueDate]) rawDataByDate[pt.valueDate] = { portfolio: 0, deposits: 0, date: new Date(pt.valueDate) };
                rawDataByDate[pt.valueDate].portfolio = pt.value;
            });

            dSeries.forEach(pt => {
                if (!rawDataByDate[pt.valueDate]) rawDataByDate[pt.valueDate] = { portfolio: 0, deposits: 0, date: new Date(pt.valueDate) };
                rawDataByDate[pt.valueDate].deposits = pt.value;
            });
            
            const rowsByMonth = {};
            Object.values(rawDataByDate).sort((a,b) => a.date - b.date).forEach(pt => {
                const date = pt.date;
                const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}`;
                if (!rowsByMonth[key]) {
                    rowsByMonth[key] = { ...pt };
                } else {
                    if (pt.portfolio > 0) rowsByMonth[key].portfolio = pt.portfolio;
                    if (pt.deposits > 0) rowsByMonth[key].deposits = pt.deposits;
                    rowsByMonth[key].date = date; 
                }
            });

            const sortedMonths = Object.keys(rowsByMonth).sort();
            const amundiColor = '#003466';
            
            const tableContainer = document.createElement('div');
            tableContainer.id = 'amundi-custom-results';
            tableContainer.style.marginTop = '30px';
            tableContainer.style.background = '#fff';
            tableContainer.style.padding = '20px';
            tableContainer.style.borderRadius = '8px';
            tableContainer.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,.1)';
            tableContainer.style.userSelect = 'text';
            tableContainer.style.webkitUserSelect = 'text';
            
            let tableHTML = `
                <style>
                    #amundi-custom-results * { user-select: text !important; -webkit-user-select: text !important; }
                </style>
                <h3 style="color: ${amundiColor}; margin-bottom: 15px; font-weight: bold; border-bottom: 2px solid ${amundiColor}; padding-bottom: 10px;">Zhodnocení portfolia (konec měsíce)</h3>
                <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-family: 'Open Sans', Arial, sans-serif; text-align: right;">
                    <thead>
                        <tr style="background-color: ${amundiColor}; color: white;">
                            <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Datum</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Změna vkladů</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Celkové vklady</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Hodnota portfolia</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Rozdíl</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            let prevDeposit = 0;
            let diffDataForChart = [];
            let categoriesForChart = [];
            let monthData = [];

            sortedMonths.forEach((monthKey, idx) => {
                const data = rowsByMonth[monthKey];
                const portfolio = data.portfolio;
                const deposit = data.deposits;
                
                let depositChange = deposit - prevDeposit;
                if (idx === 0) depositChange = deposit;
                prevDeposit = deposit;

                const difference = portfolio - deposit;

                const dateStr = data.date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                monthData.push({
                    year: data.date.getFullYear(),
                    dateStr,
                    depositChange,
                    deposit,
                    portfolio,
                    difference
                });

                categoriesForChart.push(dateStr);
                diffDataForChart.push(difference);
            });
            
            // Group by year
            const dataByYear = {};
            monthData.forEach(row => {
                if (!dataByYear[row.year]) dataByYear[row.year] = [];
                dataByYear[row.year].push(row);
            });
            
            const years = Object.keys(dataByYear).map(Number).sort((a,b) => b - a); // Descending order of years
            const formatCurrency = (val) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 }).format(val);

            years.forEach(year => {
                const rows = dataByYear[year];
                rows.reverse(); // Descending order of months within the year
                
                const latest = rows[0]; // Latest data of this year
                const diffColorYear = latest.difference >= 0 ? '#28a745' : '#dc3545';
                const diffSignYear = latest.difference > 0 ? '+' : '';

                // Header row for the year
                tableHTML += `
                    <tr onclick="const tb = document.getElementById('amundi-year-${year}'); const ic = document.getElementById('amundi-year-icon-${year}'); if(tb.style.display==='none'){tb.style.display='table-row-group'; ic.innerText='▼';}else{tb.style.display='none'; ic.innerText='▶';}" style="background-color: #dbe4f0; cursor: pointer; border-bottom: 2px solid #fff; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#c9d6e8'" onmouseout="this.style.backgroundColor='#dbe4f0'">
                        <td style="padding: 12px 10px; border: 1px solid #c2d0e0; text-align: left; font-weight: bold; color: ${amundiColor};">
                            <span id="amundi-year-icon-${year}" style="display:inline-block; width:15px;">▼</span> Rok ${year}
                        </td>
                        <td style="padding: 12px 10px; border: 1px solid #c2d0e0; color: #444; font-weight: bold;">${latest.depositChange > 0 ? '+' : ''}${formatCurrency(latest.depositChange)}</td>
                        <td style="padding: 12px 10px; border: 1px solid #c2d0e0; font-weight: bold;">${formatCurrency(latest.deposit)}</td>
                        <td style="padding: 12px 10px; border: 1px solid #c2d0e0; font-weight: bold; color: ${amundiColor};">${formatCurrency(latest.portfolio)}</td>
                        <td style="padding: 12px 10px; border: 1px solid #c2d0e0; font-weight: bold; color: ${diffColorYear};">${diffSignYear}${formatCurrency(latest.difference)}</td>
                    </tr>
                `;
                
                tableHTML += `<tbody id="amundi-year-${year}" style="display: table-row-group;">`;
                
                rows.forEach(row => {
                    const diffColor = row.difference >= 0 ? '#28a745' : '#dc3545';
                    const diffSign = row.difference > 0 ? '+' : '';
                    tableHTML += `
                        <tr style="border-bottom: 1px solid #eee; background-color: #ffffff;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='#ffffff'">
                            <td style="padding: 10px; border: 1px solid #eee; text-align: left; padding-left: 28px; color: #555;">${row.dateStr}</td>
                            <td style="padding: 10px; border: 1px solid #eee; color: #777;">${row.depositChange > 0 ? '+' : ''}${formatCurrency(row.depositChange)}</td>
                            <td style="padding: 10px; border: 1px solid #eee; color: #333;">${formatCurrency(row.deposit)}</td>
                            <td style="padding: 10px; border: 1px solid #eee; color: ${amundiColor};">${formatCurrency(row.portfolio)}</td>
                            <td style="padding: 10px; border: 1px solid #eee; font-weight: bold; color: ${diffColor};">${diffSign}${formatCurrency(row.difference)}</td>
                        </tr>
                    `;
                });
                
                tableHTML += `</tbody>`;
            });

            tableHTML += `</table></div>`;
            
            tableContainer.innerHTML = tableHTML;
            tableContainer.innerHTML += `<div id="amundi-diff-chart" style="width: 100%; height: 300px; margin-top: 20px;"></div>`;
            
            // Připojíme pod Highcharts div, pokud neexistuje el-card
            let targetNode = domCharts[0].closest('.el-card');
            if (!targetNode) targetNode = domCharts[0].parentNode;
            
            if (targetNode && targetNode.parentNode) {
                targetNode.parentNode.insertBefore(tableContainer, targetNode.nextSibling);
            } else if (targetNode) {
                targetNode.appendChild(tableContainer);
            } else {
                document.body.appendChild(tableContainer);
            }

            // SVG Native Chart Generator (CSP Safe)
            function drawSVGChart() {
                const container = document.getElementById('amundi-diff-chart');
                if (!container) return;
                
                // Basic dimensions
                const w = container.clientWidth || 800;
                const h = 300;
                const padX = 50;
                const padY = 50;
                
                if (diffDataForChart.length === 0) return;

                // Find min and max for Y axis
                let min = Math.min(...diffDataForChart, 0);
                let max = Math.max(...diffDataForChart, 0);
                if (min === max) { min -= 100; max += 100; }
                const range = max - min;
                
                const stepX = (w - 2 * padX) / Math.max(1, diffDataForChart.length - 1);
                const getY = (val) => h - padY - ((val - min) / range) * (h - 2 * padY);
                const getX = (i) => padX + i * stepX;
                const zeroY = getY(0);
                
                let svg = `<svg width="100%" height="${h}" style="font-family: Arial, sans-serif; background: #fff; border-top: 1px solid #eee; margin-top: 10px;">`;
                
                // Title
                svg += `<text x="10" y="25" fill="${amundiColor}" font-weight="bold" font-size="14">Vývoj rozdílu (Zisk/Ztráta)</text>`;
                
                // Zero line (axis)
                svg += `<line x1="${padX}" y1="${zeroY}" x2="${w-padX}" y2="${zeroY}" stroke="#aaa" stroke-width="1.5" stroke-dasharray="4" />`;
                
                // Path string
                let pts = [];
                for (let i = 0; i < diffDataForChart.length; i++) {
                    pts.push(`${getX(i)},${getY(diffDataForChart[i])}`);
                }
                
                // Gradient for Area
                svg += `<defs>
                            <linearGradient id="gradAmundi" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" style="stop-color:${amundiColor};stop-opacity:0.2" />
                                <stop offset="100%" style="stop-color:${amundiColor};stop-opacity:0" />
                            </linearGradient>
                        </defs>`;
                
                // Area polygon
                if (diffDataForChart.length > 1) {
                    const areaPts = `${getX(0)},${zeroY} ` + pts.join(' ') + ` ${getX(diffDataForChart.length-1)},${zeroY}`;
                    svg += `<polygon points="${areaPts}" fill="url(#gradAmundi)" />`;
                }
                
                // Line
                svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${amundiColor}" stroke-width="2.5" />`;
                
                // Points and Labels
                const numPoints = diffDataForChart.length;
                const labelFrequency = Math.ceil(numPoints / 12); // Max 12 labels to avoid overlap
                
                for (let i = 0; i < numPoints; i++) {
                    const val = diffDataForChart[i];
                    const x = getX(i);
                    const y = getY(val);
                    const color = val >= 0 ? '#28a745' : '#dc3545';
                    
                    // Draw point
                    svg += `<circle cx="${x}" cy="${y}" r="4" fill="${amundiColor}" />`;
                    
                    // Draw labels for some points to not clutter
                    if (i % labelFrequency === 0 || i === numPoints - 1) {
                        const valStr = (val > 0 ? '+' : '') + new Intl.NumberFormat('cs-CZ').format(Math.round(val));
                        svg += `<text x="${x}" y="${y - 12}" fill="${color}" font-size="11" font-weight="bold" text-anchor="middle">${valStr}</text>`;
                        
                        // Date label (MM.YYYY)
                        const parts = categoriesForChart[i].replace(/\s/g, '').split('.');
                        const dateLabel = parts.length >= 3 ? `${parts[1]}.${parts[2]}` : categoriesForChart[i];
                        svg += `<text x="${x}" y="${h - 15}" fill="#666" font-size="11" text-anchor="middle">${dateLabel}</text>`;
                    }
                }
                
                svg += `</svg>`;
                container.innerHTML = svg;
            }

            // Wait for DOM layout to calculate clientWidth properly
            setTimeout(drawSVGChart, 10);

        } catch (err) {
            console.error('Amundi Skript - Chyba při vykreslování:', err);
        }

    }, 1000);

})();
