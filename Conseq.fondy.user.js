// ==UserScript==
// @name         Conseq Fund Chart Enhancer
// @namespace    http://conseq.cz/
// @version      1.3
// @description  Verze 4.0 rozšířená o bleskové stahování inflace z ČSÚ přímo přes oficiální JSON-stat API s vylepšeným parserem.
// @description  Nastaví datum od 22.02.2024, zvýrazní 1. den v měsíci (nebo konec předchozího) v grafu a vytvoří pod ním tabulku s procentuálním zhodnocením.
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

            const xData = chart.series[0].xData;
            const yData = chart.series[0].yData;
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

            // 1. ZPRACOVÁNÍ DAT - Hledání 1. dne v měsíci (nebo posledního dne předešlého měsíce)
            for (let i = 1; i < xData.length; i++) {
                const prevDate = new Date(xData[i - 1]);
                const currDate = new Date(xData[i]);

                const prevMonthKey = `${prevDate.getUTCFullYear()}-${prevDate.getUTCMonth()}`;
                const currMonthKey = `${currDate.getUTCFullYear()}-${currDate.getUTCMonth()}`;

                if (currMonthKey !== prevMonthKey) {
                    // Došlo ke změně měsíce. Nyní zkontrolujeme, zda je "currDate" přesně 1. den.
                    if (currDate.getUTCDate() === 1) {
                        // 1. den v tabulce je, vezmeme ho.
                        targetDays.push({ x: xData[i], y: yData[i] });
                    } else {
                        // 1. den v tabulce není, vezmeme v potaz poslední předchozí den předešlého měsíce
                        targetDays.push({ x: xData[i - 1], y: yData[i - 1] });
                    }
                }
            }

            // Přidáme i úplně poslední dostupný bod dat (aktuální stav), pokud ještě není v poli
            if (xData.length > 0) {
                const lastPoint = { x: xData[xData.length - 1], y: yData[yData.length - 1] };
                if (targetDays.length === 0 || targetDays[targetDays.length - 1].x !== lastPoint.x) {
                    targetDays.push(lastPoint);
                }
            }

            // Vyfiltrujeme pouze data od 22.02.2024 a spočítáme zhodnocení
            const filteredDays = targetDays.filter(point => point.x >= targetMinUTC).map(point => {
                return {
                    x: point.x,
                    y: point.y, // Ponecháme absolutní Y hodnotu, aby tečka správně "seděla" na křivce grafu
                    perc: ((point.y / baseValue) - 1) * 100 // Vypočítané procentuální zhodnocení
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

                                // Formátování procent
                                const percVal = this.options.perc;
                                const sign = percVal > 0 ? '+' : '';
                                const color = percVal >= 0 ? 'green' : 'red';
                                const percStr = sign + percVal.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                                return `<b>${dateStr}</b><br/>Zhodnocení: <b style="color: ${color};">${percStr} %</b>`;
                            }
                        },
                        zIndex: 5
                    });

                    // 4. VYTVOŘENÍ A VLOŽENÍ TABULKY
                    buildTable(filteredDays);

                } catch (e) {
                    console.error("Chyba ve vlastním Conseq skriptu:", e);
                }
            }, 1000);
        }

        function buildTable(dataPoints) {
            const tableContainer = document.createElement('div');
            tableContainer.id = 'conseq-custom-table';
            tableContainer.style.marginTop = '40px';
            tableContainer.style.marginBottom = '40px';
            tableContainer.style.fontFamily = '"Open Sans", Arial, sans-serif';

            let tableHTML = `
                <h3 style="margin-bottom: 15px; color: #004d80; font-size: 1.25rem; font-weight: bold;">Zhodnocení k 1. dni v měsíci (nebo ke konci předešlého)</h3>
                <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <thead>
                    <tr style="background-color: #004d80; color: white;">
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Datum</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Zhodnocení od 22.02.2024</th>
                    </tr>
                </thead>
                <tbody>`;

            // Reverzní pořadí pro tabulku
            const sortedData = [...dataPoints].reverse();

            sortedData.forEach((point, index) => {
                const d = new Date(point.x);
                const day = String(d.getUTCDate()).padStart(2, '0');
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const year = d.getUTCFullYear();
                const dateStr = `${day}.${month}.${year}`;

                // Formátování procent pro tabulku
                const percVal = point.perc;
                const sign = percVal > 0 ? '+' : '';
                const valColor = percVal >= 0 ? 'green' : 'red';
                const valStr = sign + percVal.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

                const bg = index % 2 === 0 ? '#f9f9f9' : '#ffffff';

                tableHTML += `
                <tr style="background-color: ${bg}; border-bottom: 1px solid #eee;">
                    <td style="padding: 10px 12px; border: 1px solid #ddd;">${dateStr}</td>
                    <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; font-weight: 600; color: ${valColor};">${valStr}</td>
                </tr>`;
            });

            tableHTML += `</tbody></table>`;
            tableContainer.innerHTML = tableHTML;

            const chartElem = document.getElementById('fund_chart');
            if (chartElem && chartElem.parentNode) {
                chartElem.parentNode.insertBefore(tableContainer, chartElem.nextSibling);
            }
        }
    }

    const script = document.createElement('script');
    script.textContent = '(' + injectCode.toString() + ')();';
    (document.head || document.documentElement).appendChild(script);
    script.remove();
})();
