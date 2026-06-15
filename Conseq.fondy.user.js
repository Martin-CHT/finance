// ==UserScript==
// @name         Conseq Fund Chart Enhancer
// @namespace    http://conseq.cz/
// @version      2.0
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
                        targetDays.push({ x: xData[i], y: yData[i], deposit: yDataDeposits ? yDataDeposits[i] : null });
                    } else {
                        // 1. den v tabulce není, vezmeme v potaz poslední předchozí den předešlého měsíce
                        targetDays.push({ x: xData[i - 1], y: yData[i - 1], deposit: yDataDeposits ? yDataDeposits[i - 1] : null });
                    }
                }
            }

            // Přidáme i úplně poslední dostupný bod dat (aktuální stav), pokud ještě není v poli
            if (xData.length > 0) {
                const lastIndex = xData.length - 1;
                const lastPoint = { x: xData[lastIndex], y: yData[lastIndex], deposit: yDataDeposits ? yDataDeposits[lastIndex] : null };
                if (targetDays.length === 0 || targetDays[targetDays.length - 1].x !== lastPoint.x) {
                    targetDays.push(lastPoint);
                }
            }

            // Vyfiltrujeme pouze data od 22.02.2024 a spočítáme zhodnocení
            const filteredDays = targetDays.filter(point => point.x >= targetMinUTC).map((point, index, arr) => {
                let depositChange = 6000; // defaultní hodnota
                if (isDetailSmlouvy && point.deposit !== null) {
                    if (index > 0 && arr[index - 1].deposit !== null) {
                        depositChange = point.deposit - arr[index - 1].deposit;
                    } else {
                        // zkusíme najít předchozí bod v celém targetDays, i před targetMinUTC
                        const targetIndex = targetDays.findIndex(p => p.x === point.x);
                        if (targetIndex > 0 && targetDays[targetIndex - 1].deposit !== null) {
                            depositChange = point.deposit - targetDays[targetIndex - 1].deposit;
                        } else {
                            depositChange = point.deposit;
                        }
                    }
                }

                return {
                    x: point.x,
                    y: point.y, // Ponecháme absolutní Y hodnotu, aby tečka správně "seděla" na křivce grafu
                    perc: ((point.y / baseValue) - 1) * 100, // Vypočítané procentuální zhodnocení
                    deposit: point.deposit,
                    depositChange: depositChange
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

            // Přidáme listener pro "násilné" zkopírování textu,
            // čímž obejdeme případné blokování ze strany Conseq portálu.
            tableContainer.addEventListener('copy', function(e) {
                const selection = window.getSelection().toString();
                if (selection) {
                    e.clipboardData.setData('text/plain', selection);
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            let tableHTML = `
                <h3 style="margin-bottom: 15px; color: #004d80; font-size: 1.25rem; font-weight: bold;">Stav účtu a zhodnocení k 1. dni v měsíci (nebo ke konci předešlého)</h3>
                <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <thead>`;

            if (isDetailSmlouvy) {
                tableHTML += `
                    <tr style="background-color: #004d80; color: white;">
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Datum</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Změna výše vkladů</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Celková výše vkladů</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Hodnota portfolia</th>
                        <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Rozdíl</th>
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

            // Reverzní pořadí pro tabulku
            const sortedData = [...dataPoints].reverse();

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

                    tableHTML += `
                    <tr style="background-color: ${bg}; border-bottom: 1px solid #eee;">
                        <td style="padding: 10px 12px; border: 1px solid #ddd;">${dateStr}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${depChangeStr}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right;">${depStr}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${valStrKč}</td>
                        <td style="padding: 10px 12px; border: 1px solid #ddd; text-align: right; font-weight: 600; color: ${diffColor};">${diffStr}</td>
                    </tr>`;
                } else {
                    // Formátování procent pro původní tabulku
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
                const diffChartContainer = document.createElement('div');
                diffChartContainer.id = 'conseq-diff-chart';
                diffChartContainer.style.width = '100%';
                diffChartContainer.style.height = '350px';
                diffChartContainer.style.marginTop = '30px';
                tableContainer.appendChild(diffChartContainer);
            }

            const chartElem = document.getElementById('fund_chart');
            if (chartElem && chartElem.parentNode) {
                chartElem.parentNode.insertBefore(tableContainer, chartElem.nextSibling);
            }

            if (isDetailSmlouvy && typeof Highcharts !== 'undefined') {
                const chartData = dataPoints.filter(p => p.deposit !== null).map(p => {
                    return [p.x, p.y - p.deposit];
                });

                Highcharts.chart('conseq-diff-chart', {
                    chart: {
                        type: 'line'
                    },
                    title: {
                        text: 'Vývoj rozdílu hodnoty portfolia vůči vkladu',
                        style: {
                            color: '#004d80',
                            fontWeight: 'bold',
                            fontSize: '1.1rem'
                        }
                    },
                    xAxis: {
                        type: 'datetime',
                        labels: {
                            formatter: function() {
                                return Highcharts.dateFormat('%m.%Y', this.value);
                            }
                        }
                    },
                    yAxis: {
                        title: {
                            text: 'Rozdíl (Kč)'
                        },
                        labels: {
                            formatter: function() {
                                return this.value.toLocaleString('cs-CZ') + ' Kč';
                            }
                        }
                    },
                    tooltip: {
                        formatter: function() {
                            return '<b>' + Highcharts.dateFormat('%d.%m.%Y', this.x) + '</b><br/>Rozdíl: <b style="color: ' + (this.y >= 0 ? 'green' : 'red') + ';">' + (this.y > 0 ? '+' : '') + this.y.toLocaleString('cs-CZ') + ' Kč</b>';
                        }
                    },
                    legend: {
                        enabled: false
                    },
                    series: [{
                        name: 'Rozdíl',
                        data: chartData,
                        color: '#004d80',
                        marker: {
                            enabled: true,
                            radius: 4,
                            fillColor: '#004d80'
                        }
                    }],
                    credits: {
                        enabled: false
                    }
                });
            }
        }
    }

    const script = document.createElement('script');
    script.textContent = '(' + injectCode.toString() + ')();';
    (document.head || document.documentElement).appendChild(script);
    script.remove();
})();
