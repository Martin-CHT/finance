// ==UserScript==
// @name         Conseq Fund Chart Enhancer
// @namespace    http://conseq.cz/
// @version      2.1
// @description  Verze 1.5 - Oprava zachytávání dat: tabulka a graf nyní pracují striktně s posledním dostupným dnem každého měsíce.
// @author       Martin
// @copyright    2026, Martin
// @license      Proprietary - internal use only
// @homepageURL  https://github.com/Martin-CHT/web
// @source       https://github.com/Martin-CHT/web
// @supportURL   https://github.com/Martin-CHT/web/issues
// @icon         https://ftp.conseq.cz/images/logo/conseq-ftp.png
// @icon64       https://ftp.conseq.cz/images/logo/conseq-ftp.png
// @updateURL    https://github.com/Martin-CHT/web/raw/refs/heads/main/finance/Conseq.fondy.user.js
// @downloadURL  https://github.com/Martin-CHT/web/raw/refs/heads/main/finance/Conseq.fondy.user.js
// @match        https://www.conseq.cz/investice/prehled-fondu/*
// @match        https://www.conseq.cz/muj-conseq/detail-smlouvy/*
// @grant        none
// @tag          Finance
// @tag          CONSEQ
// ==/UserScript==

(function () {
    'use strict';

    // Pro obejití izolovaného prostředí (sandboxu) Tampermonkey vložíme skript přímo do stránky.
    function injectCode() {
        const waitForChart = setInterval(() => {
            if (typeof Highcharts !== 'undefined' && Highcharts.charts && Highcharts.charts.length > 0) {
                const chart = Highcharts.charts.find(c => c && c.renderTo && c.renderTo.id === 'fund_chart');

                if (chart && chart.series && chart.series.length > 0 && chart.series[0].xData && chart.series[0].xData.length > 0) {
                    clearInterval(waitForChart);
                    processChart(chart);
                }
            }
        }, 500);

        function processChart(chart) {
            if (document.getElementById('conseq-custom-table')) return;

            const isDetailSmlouvy = window.location.href.includes('detail-smlouvy');

            const xData = chart.series[0].xData;
            const yData = chart.series[0].yData;
            const yDataDeposits = isDetailSmlouvy && chart.series.length > 1 ? chart.series[1].yData : null;
            const targetDays = [];

            const targetMinUTC = Date.UTC(2024, 1, 22);

            // Zjištění výchozí hodnoty pro výpočet procent (první hodnota od 22.02.2024)
            let baseValue = yData[0]; // fallback
            for (let i = 0; i < xData.length; i++) {
                if (xData[i] >= targetMinUTC) {
                    baseValue = yData[i];
                    break;
                }
            }

            // 1. ZPRACOVÁNÍ DAT - Nalezení striktně posledního dostupného dne pro každý měsíc
            for (let i = 0; i < xData.length; i++) {
                const currDate = new Date(xData[i]);
                const currMonthKey = `${currDate.getUTCFullYear()}-${currDate.getUTCMonth()}`;

                let isLastDayOfMonth = false;

                if (i === xData.length - 1) {
                    // Úplně poslední dostupný bod dat je automaticky považován za konec svého (zatím neúplného) měsíce
                    isLastDayOfMonth = true;
                } else {
                    const nextDate = new Date(xData[i + 1]);
                    const nextMonthKey = `${nextDate.getUTCFullYear()}-${nextDate.getUTCMonth()}`;

                    // Pokud je "zítřejší" záznam už v jiném měsíci, znamená to, že "dnešní" záznam je posledním dnem v aktuálním měsíci.
                    if (currMonthKey !== nextMonthKey) {
                        isLastDayOfMonth = true;
                    }
                }

                if (isLastDayOfMonth) {
                    targetDays.push({ x: xData[i], y: yData[i], deposit: yDataDeposits ? yDataDeposits[i] : null });
                }
            }

            // Vyfiltrujeme pouze data od 22.02.2024 a spočítáme zhodnocení a měsíční rozdíly
            const filteredDays = targetDays.filter(point => point.x >= targetMinUTC).map((point, index, arr) => {
                let depositChange = 6000; // defaultní hodnota
                let momPortfolioDiff = 0; // Měsíční rozdíl hodnoty portfolia
                let hasPrevious = false;

                if (isDetailSmlouvy) {
                    // Zjištění změny vkladů meziměsíčně
                    if (point.deposit !== null) {
                        if (index > 0 && arr[index - 1].deposit !== null) {
                            depositChange = point.deposit - arr[index - 1].deposit;
                        } else {
                            const targetIndex = targetDays.findIndex(p => p.x === point.x);
                            if (targetIndex > 0 && targetDays[targetIndex - 1].deposit !== null) {
                                depositChange = point.deposit - targetDays[targetIndex - 1].deposit;
                            } else {
                                depositChange = point.deposit;
                            }
                        }
                    }

                    // Zjištění meziměsíčního rozdílu hodnoty portfolia
                    if (index > 0) {
                        momPortfolioDiff = point.y - arr[index - 1].y;
                        hasPrevious = true;
                    } else {
                        const targetIndex = targetDays.findIndex(p => p.x === point.x);
                        if (targetIndex > 0) {
                            momPortfolioDiff = point.y - targetDays[targetIndex - 1].y;
                            hasPrevious = true;
                        }
                    }
                }

                return {
                    x: point.x,
                    y: point.y,
                    perc: ((point.y / baseValue) - 1) * 100,
                    deposit: point.deposit,
                    depositChange: depositChange,
                    momPortfolioDiff: momPortfolioDiff,
                    hasPrevious: hasPrevious
                };
            });

            // 2. NASTAVENÍ POČÁTEČNÍHO DATA GRAFU NA 22.02.2024
            setTimeout(() => {
                try {
                    chart.xAxis[0].setExtremes(targetMinUTC, chart.xAxis[0].max);

                    // 3. ZVÝRAZNĚNÍ BODŮ V GRAFU
                    chart.addSeries({
                        type: 'scatter',
                        name: 'Vybrané datum',
                        data: filteredDays,
                        marker: {
                            radius: 5,
                            fillColor: '#FF0000',
                            lineColor: '#FFFFFF',
                            lineWidth: 1,
                            symbol: 'circle'
                        },
                        tooltip: {
                            pointFormatter: function () {
                                const d = new Date(this.x);
                                const day = String(d.getUTCDate()).padStart(2, '0');
                                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                                const year = d.getUTCFullYear();
                                const dateStr = `${day}.${month}.${year}`;

                                const percVal = this.options.perc;
                                const sign = percVal > 0 ? '+' : '';
                                const color = percVal >= 0 ? 'green' : 'red';
                                const percStr = sign + percVal.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                                return `<b>${dateStr}</b><br/>Zhodnocení: <b style="color: ${color};">${percStr} %</b>`;
                            }
                        },
                        zIndex: 5
                    });

                    // 4. VYTVOŘENÍ A VLOŽENÍ TABULKY A NOVÉHO GRAFU
                    buildTable(filteredDays, isDetailSmlouvy);

                } catch (e) {
                    console.error("Chyba ve vlastním Conseq skriptu:", e);
                }
            }, 1000);
        }

        function buildTable(dataPoints, isDetailSmlouvy) {
            const tableContainer = document.createElement('div');
            tableContainer.id = 'conseq-custom-table';
            tableContainer.style.marginTop = '40px';
            tableContainer.style.marginBottom = '40px';
            tableContainer.style.fontFamily = '"Open Sans", Arial, sans-serif';
            tableContainer.style.userSelect = 'text';
            tableContainer.style.webkitUserSelect = 'text';
            tableContainer.style.msUserSelect = 'text';
            tableContainer.style.mozUserSelect = 'text';

            tableContainer.addEventListener('copy', function(e) {
                const selection = window.getSelection().toString();
                if (selection) {
                    e.clipboardData.setData('text/plain', selection);
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            let tableHTML = `
                <h3 style="margin-bottom: 15px; color: #004d80; font-size: 1.25rem; font-weight: bold;">Stav účtu a zhodnocení k poslednímu dostupnému dni v měsíci</h3>
                <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <thead>`;

            if (isDetailSmlouvy) {
                // Sloupec Měsíční rozdíl zúžen a přidán span pro dynamický text labelu
                tableHTML += `
                    <tr style="background-color: #004d80; color: white;">
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Datum</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Změna výše vkladů</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Celková výše vkladů</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Hodnota portfolia</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right; width: 130px; min-width: 120px;">
                            Měsíční rozdíl<br/>
                            <label style="font-size: 0.8em; cursor: pointer; display: inline-flex; align-items: center; justify-content: flex-end; font-weight: normal; margin-top: 4px; white-space: nowrap;">
                                <input type="checkbox" id="toggle-mom-type" checked style="margin-right: 5px;">
                                <span id="toggle-mom-label">Čistý zisk</span>
                            </label>
                        </th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Celkový Rozdíl</th>
                    </tr>
                </thead>
                <tbody>`;
            } else {
                tableHTML += `
                    <tr style="background-color: #004d80; color: white;">
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Datum</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Zhodnocení od 22.02.2024</th>
                    </tr>
                </thead>
                <tbody>`;
            }

            const sortedData = [...dataPoints].reverse();
            const momCellsData = []; // Zde si uložíme data pro přepínání sloupců v tabulce

            sortedData.forEach((point, index) => {
                const d = new Date(point.x);
                const day = String(d.getUTCDate()).padStart(2, '0');
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const year = d.getUTCFullYear();
                const dateStr = `${day}.${month}.${year}`;

                const bg = index % 2 === 0 ? '#f9f9f9' : '#ffffff';

                if (isDetailSmlouvy && point.deposit !== null) {
                    const depChangeSign = point.depositChange > 0 ? '+' : '';
                    const depChangeStr = depChangeSign + point.depositChange.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ',- Kč';
                    const depStr = point.deposit.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ',- Kč';
                    const valStrKč = point.y.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ',- Kč';

                    const diff = point.y - point.deposit;
                    const diffColor = diff >= 0 ? 'green' : 'red';
                    const diffSign = diff > 0 ? '+' : '';
                    const diffStr = diffSign + diff.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ',- Kč';

                    // Uložíme si data pro budoucí dynamické přepnutí
                    momCellsData.push({
                        id: `mom-cell-${index}`,
                        rawDiff: point.momPortfolioDiff,
                        cleanProfit: point.momPortfolioDiff - point.depositChange,
                        hasPrevious: point.hasPrevious
                    });

                    tableHTML += `
                    <tr style="background-color: ${bg}; border-bottom: 1px solid #eee;">
                        <td style="padding: 10px 12px; border: 1px solid #ddd;">${dateStr}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${depChangeStr}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${depStr}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${valStrKč}</td>
                        <td id="mom-cell-${index}" style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; font-weight: 600;">-</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; font-weight: 600; color: ${diffColor};">${diffStr}</td>
                    </tr>`;
                } else {
                    const percVal = point.perc;
                    const sign = percVal > 0 ? '+' : '';
                    const valColor = percVal >= 0 ? 'green' : 'red';
                    const valStr = sign + percVal.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

                    tableHTML += `
                    <tr style="background-color: ${bg}; border-bottom: 1px solid #eee;">
                        <td style="padding: 10px 12px; border: 1px solid #ddd;">${dateStr}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; font-weight: 600; color: ${valColor};">${valStr}</td>
                    </tr>`;
                }
            });

            tableHTML += `</tbody></table>`;
            tableContainer.innerHTML = tableHTML;

            if (isDetailSmlouvy) {
                // Přidáme HTML strukturu pro nový graf a jeho přepínač (nad tabulku)
                const chartWrapper = document.createElement('div');
                chartWrapper.style.marginTop = '40px';
                chartWrapper.style.marginBottom = '20px';

                // Přepínač typu zobrazení
                const controlsHtml = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="color: #004d80; font-size: 1.25rem; font-weight: bold; margin: 0;">Vývoj měsíčního čistého zisku</h3>
                        <div style="font-size: 0.95rem;">
                            <label style="cursor: pointer; margin-right: 15px;">
                                <input type="radio" name="chartTypeSwitch" value="column" checked> Sloupce
                            </label>
                            <label style="cursor: pointer;">
                                <input type="radio" name="chartTypeSwitch" value="line"> Křivka
                            </label>
                        </div>
                    </div>
                `;
                chartWrapper.innerHTML = controlsHtml;

                const diffChartContainer = document.createElement('div');
                diffChartContainer.id = 'conseq-diff-chart';
                diffChartContainer.style.width = '100%';
                diffChartContainer.style.height = '350px';

                chartWrapper.appendChild(diffChartContainer);
                tableContainer.insertBefore(chartWrapper, tableContainer.firstChild);
            }

            const chartElem = document.getElementById('fund_chart');
            if (chartElem && chartElem.parentNode) {
                chartElem.parentNode.insertBefore(tableContainer, chartElem.nextSibling);
            }

            if (isDetailSmlouvy) {
                // Logika pro toggle checkbox v hlavičce tabulky
                const toggleCheckbox = document.getElementById('toggle-mom-type');
                const toggleLabel = document.getElementById('toggle-mom-label');

                function updateMomCells() {
                    const isCleanProfit = toggleCheckbox.checked;
                    toggleLabel.textContent = isCleanProfit ? 'Čistý zisk' : 'S vkladem';

                    momCellsData.forEach(cellData => {
                        const td = document.getElementById(cellData.id);
                        if (!td) return;

                        if (!cellData.hasPrevious) {
                            td.innerHTML = '-'; // První měsíc nemá předchozí data pro srovnání
                            return;
                        }

                        const val = isCleanProfit ? cellData.cleanProfit : cellData.rawDiff;
                        const color = val >= 0 ? 'green' : 'red';
                        const sign = val > 0 ? '+' : '';

                        // Zde formátujeme striktně na 2 desetinná místa jako je na původním webu (haléře)
                        const valStr = val.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        td.innerHTML = `<span style="color: ${color}; font-weight: 600;">${sign}${valStr} Kč</span>`;
                    });
                }

                if (toggleCheckbox) {
                    toggleCheckbox.addEventListener('change', updateMomCells);
                    updateMomCells(); // Inicializace po načtení
                }

                // Vykreslení grafu pro čistý zisk
                if (typeof Highcharts !== 'undefined') {
                    // Kategoriální osa - vyžaduje pole objektů s "name"
                    const chartData = dataPoints.slice(1).map(p => {
                        const cleanDiff = p.momPortfolioDiff - p.depositChange;
                        return {
                            name: Highcharts.dateFormat('%m.%Y', p.x),
                            y: cleanDiff,
                            exactDate: p.x
                        };
                    });

                    const diffChart = Highcharts.chart('conseq-diff-chart', {
                        chart: {
                            type: 'column'
                        },
                        title: {
                            text: ''
                        },
                        xAxis: {
                            type: 'category', // Kategoriální osa - zabrání překrývání sloupců nehledě na počet dnů mezi body
                            labels: {
                                style: {
                                    fontSize: '11px'
                                },
                                rotation: -45 // Mírné naklonění štítků pro lepší čitelnost
                            }
                        },
                        yAxis: {
                            title: {
                                text: 'Čistý zisk (Kč)'
                            },
                            labels: {
                                formatter: function() {
                                    return this.value.toLocaleString('cs-CZ') + ' Kč';
                                }
                            }
                        },
                        tooltip: {
                            formatter: function() {
                                return '<b>' + Highcharts.dateFormat('%d.%m.%Y', this.point.exactDate) + '</b><br/>Čistý zisk: <b style="color: ' + (this.y >= 0 ? 'green' : 'red') + ';">' + (this.y > 0 ? '+' : '') + this.y.toLocaleString('cs-CZ') + ' Kč</b>';
                            }
                        },
                        legend: {
                            enabled: false
                        },
                        plotOptions: {
                            column: {
                                pointPadding: 0.1,  // Menší padding -> širší sloupce (0 = spojené, 0.5 = úzké čáry)
                                groupPadding: 0.05,
                                borderWidth: 0,
                                zones: [{
                                    value: 0,
                                    color: '#dc3545'
                                }, {
                                    color: '#28a745'
                                }]
                            },
                            line: {
                                marker: {
                                    enabled: true,
                                    radius: 4
                                },
                                zones: [{
                                    value: 0,
                                    color: '#dc3545'
                                }, {
                                    color: '#28a745'
                                }]
                            }
                        },
                        series: [{
                            name: 'Čistý zisk',
                            data: chartData
                        }],
                        credits: {
                            enabled: false
                        }
                    });

                    // Posluchače pro radio buttony na změnu typu grafu
                    const radioInputs = document.querySelectorAll('input[name="chartTypeSwitch"]');
                    radioInputs.forEach(radio => {
                        radio.addEventListener('change', (e) => {
                            diffChart.update({
                                chart: {
                                    type: e.target.value
                                }
                            });
                        });
                    });
                }
            }
        }
    }

    const script = document.createElement('script');
    script.textContent = '(' + injectCode.toString() + ')();';
    (document.head || document.documentElement).appendChild(script);
    script.remove();
})();
