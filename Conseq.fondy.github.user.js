// ==UserScript==
// @name         Martin-CHT Finance Automator
// @namespace    http://conseq.cz/
// @version      4.2
// @description  Verze 4.0 rozšířená o bleskové stahování inflace z ČSÚ přímo přes oficiální JSON-stat API s vylepšeným parserem.
// @author       Martin
// @copyright    2026, Martin
// @license      Proprietary - internal use only
// @homepageURL  https://github.com/Martin-CHT/web
// @source       https://github.com/Martin-CHT/web
// @supportURL   https://github.com/Martin-CHT/web/issues
// @icon         https://ftp.conseq.cz/images/logo/conseq-ftp.png
// @icon64       https://ftp.conseq.cz/images/logo/conseq-ftp.png
// @updateURL    https://github.com/Martin-CHT/web/raw/refs/heads/main/finance/Conseq.fondy.github.user.js
// @downloadURL  https://github.com/Martin-CHT/web/raw/refs/heads/main/finance/Conseq.fondy.github.user.js
// @match        https://martin-cht.github.io/web/finance/Fondy.html*
// @match        https://www.conseq.cz/investice/prehled-fondu/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        window.close
// @grant        GM_xmlhttpRequest
// @tag          Finance
// @tag          CONSEQ
// @connect      data.csu.gov.cz
// ==/UserScript==


(function () {
    'use strict';

    // =========================================================================
    // ČÁST 1: GHOST WORKER (Běží v krátkodobě otevřené záložce na conseq.cz)
    // =========================================================================
    // Spustí se POUZE na url, která má na konci speciální hashtag #automator
    if (window.location.hostname.includes('conseq.cz') && window.location.hash === '#automator') {
        let attempts = 0;
        const waitForChart = setInterval(() => {
            attempts++;
            // Čekáme na nahrání dat přímo do jádra grafu
            if (typeof Highcharts !== 'undefined' && Highcharts.charts && Highcharts.charts.length > 0) {
                const chart = Highcharts.charts.find(c => c && c.renderTo && c.renderTo.id === 'fund_chart');

                if (chart && chart.series && chart.series.length > 0 && chart.series[0].xData) {
                    clearInterval(waitForChart);

                    const xData = chart.series[0].xData;
                    const yData = chart.series[0].yData;
                    const points = [];

                    // Zabalíme data do jednoduchého pole
                    for (let i = 0; i < xData.length; i++) {
                        points.push({ time: xData[i], value: yData[i] });
                    }

                    // Uložíme data do globální mezipaměti Tampermonkey
                    GM_setValue('conseq_data_ready', {
                        url: window.location.href.split('#')[0],
                        data: points,
                        timestamp: Date.now()
                    });

                    // Bezpečně zavřeme tuto pomocnou záložku
                    window.close();
                }
            }

            // Pokud by to trvalo moc dlouho (10 vteřin), ohlásíme chybu a zavřeme záložku
            if (attempts > 50) {
                clearInterval(waitForChart);
                GM_setValue('conseq_data_ready', {
                    url: window.location.href.split('#')[0],
                    error: 'Graf se nenačetl v limitu 10s',
                    timestamp: Date.now()
                });
                window.close();
            }
        }, 200);

        return; // Zastavíme další běh tohoto skriptu na stránce Consequ
    }


    // =========================================================================
    // ČÁST 2: HLAVNÍ OVLADAČ (Běží na vašem webu martin-cht)
    // =========================================================================

    if (!window.location.hostname.includes('martin-cht.github.io')) {
        return; // Pojistka, aby se hlavní UI nespustilo na běžném brouzdání Consequ
    }

    const FUNDS = [
        { name: "World Fund", url: "https://www.conseq.cz/investice/prehled-fondu/ff-world-fund-hedged-czk", id: "inputF1" },
        { name: "Amundi CPR", url: "https://www.conseq.cz/investice/prehled-fondu/amundi-cpr-global-silver-age-hedged-czk", id: "inputF2" },
        { name: "Nová Evropa", url: "https://www.conseq.cz/investice/prehled-fondu/conseq-invest-akcie-nove-evropy-a-cs", id: "inputF3" },
        { name: "Dluhopisový", url: "https://www.conseq.cz/investice/prehled-fondu/conseq-invest-dluhopisovy-fond-a", id: "inputF4" },
        { name: "Vyvážený", url: "https://www.conseq.cz/investice/prehled-fondu/active-invest-vyvazeny", id: "inputF5" },
        { name: "Realitní", url: "https://www.conseq.cz/investice/prehled-fondu/conseq-realitni-czk", id: "inputF6" }
    ];

    const CSU_API_URL = "https://data.csu.gov.cz/api/dotaz/v1/data/vybery/CEN0101HT02?format=JSON_STAT";

    // Výchozí datum (Programátorsky 1 = Únor)
    const BASE_DATE_UTC = Date.UTC(2024, 1, 22);

    // Otevře pomocnou záložku na pozadí, získá data a záložku zavře
    async function fetchFundDataViaTab(url) {
        return new Promise((resolve, reject) => {
            let listenerId;
            let timeoutId;
            let tab;

            const cleanup = () => {
                if (listenerId) GM_removeValueChangeListener(listenerId);
                if (timeoutId) clearTimeout(timeoutId);
                if (tab) tab.close(); // Pokud se záložka nezavřela sama, zavřeme ji natvrdo odsud
            };

            // Vymažeme stará data
            GM_setValue('conseq_data_ready', null);

            // Nastavíme naslouchátko na odpověď ze záložky
            listenerId = GM_addValueChangeListener('conseq_data_ready', function (name, old_value, new_value, remote) {
                // `remote` znamená, že hodnota přišla z jiné záložky
                if (new_value && new_value.url === url && remote) {
                    cleanup();
                    if (new_value.error) {
                        reject(new Error(new_value.error));
                    } else {
                        resolve(new_value.data);
                    }
                }
            });

            // Časový limit pro stažení
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error("Timeout (15s). Záložka nedodala data."));
            }, 15000);

            // Otevřeme záložku na pozadí (active: false znamená, že prohlížeč na ni nepřepne fokus)
            tab = GM_openInTab(url + '#automator', { active: false, insert: true });
        });
    }

    // ZCELA NOVÁ FUNKCE: Přímé stažení dat z API ČSÚ a spolehlivé naparsování formátu
    async function fetchCsuDataViaApi(y, m) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: CSU_API_URL,
                headers: { "Accept": "application/json" },
                onload: function (response) {
                    if (response.status !== 200) return reject(new Error(`API vrátilo chybu sítě ${response.status}`));

                    try {
                        const data = JSON.parse(response.responseText);

                        // Záchytná síť, pokud by API změnilo formát a vrátilo rovnou ploché pole s daty
                        if (Array.isArray(data)) {
                            const mStr = String(m).padStart(2, '0');
                            let foundRow = null;
                            for (let row of data) {
                                const rowStr = JSON.stringify(row).toLowerCase();
                                if ((row.rok == y && row.mesic == m) || row.cas_kod === `${y}${mStr}` || row.cas_kod === `${y}M${mStr}`) {
                                    if (rowStr.includes('předchozího roku') || rowStr.includes('stejnému měsíci') || !foundRow) {
                                        foundRow = row;
                                    }
                                }
                            }
                            if (foundRow && foundRow.hodnota !== undefined) return resolve(foundRow.hodnota);
                            if (foundRow && foundRow.value !== undefined) return resolve(foundRow.value);
                            return reject(new Error(`Měsíc ${m}/${y} nenalezen v poli dat.`));
                        }

                        // Robustní dekódování formátu JSON-stat (poradí si s verzí 1.2 i verzí 2.0)
                        let dataset = null;
                        if (data.class === "dataset" || (data.dimension && data.value)) {
                            dataset = data;
                        } else if (data.dataset) {
                            dataset = data.dataset;
                        } else {
                            for (let key in data) {
                                if (data[key] && data[key].dimension) {
                                    dataset = data[key];
                                    break;
                                }
                            }
                        }

                        if (!dataset || !dataset.dimension || !dataset.value) {
                            console.error("CSU API Raw Data:", data);
                            return reject(new Error("API nevrátilo platný JSON_STAT formát."));
                        }

                        const dimIds = dataset.id || Object.keys(dataset.dimension).filter(k => k !== 'id' && k !== 'size' && k !== 'role');
                        const sizes = dataset.size;
                        const targetIndices = [];

                        // Hledáme správné indexy pro Rok, Měsíc a druhý sloupec (Ukazatel) v datové kostce
                        for (let i = 0; i < dimIds.length; i++) {
                            const dimId = dimIds[i];
                            const dim = dataset.dimension[dimId];
                            const indices = dim.category.index;
                            const labels = dim.category.label || {};

                            let selectedIdx = -1;

                            const getIdx = (key) => {
                                if (!indices) return undefined;
                                if (Array.isArray(indices)) {
                                    const idx = indices.indexOf(key);
                                    return idx !== -1 ? idx : undefined;
                                }
                                return indices[key];
                            };

                            const mStr = String(m).padStart(2, '0');
                            const mStrNoZero = String(m);
                            const yStr = String(y);

                            // Detekce dimenzí podle názvu a obsahu
                            let isYearDim = dimId.toLowerCase().includes('rok') || (getIdx(yStr) !== undefined && getIdx('1') === undefined);
                            let isMonthDim = dimId.toLowerCase().includes('mesic') || dimId.toLowerCase().includes('měsíc') || (getIdx(mStrNoZero) !== undefined && getIdx('12') !== undefined);
                            let isTimeDim = dimId.toLowerCase().includes('cas') || dimId.toLowerCase().includes('čas') || getIdx(`${yStr}M${mStr}`) !== undefined || getIdx(`${yStr}${mStr}`) !== undefined;

                            if (isTimeDim) {
                                selectedIdx = getIdx(`${yStr}${mStr}`) ?? getIdx(`${yStr}M${mStr}`) ?? getIdx(`${yStr}-${mStr}`);
                                if (selectedIdx === undefined) return reject(new Error(`Data pro ${m}/${y} zatím v API nejsou publikována.`));
                            } else if (isYearDim) {
                                selectedIdx = getIdx(yStr);
                                if (selectedIdx === undefined) return reject(new Error(`Rok ${y} zatím v API není (data nejsou k dispozici).`));
                            } else if (isMonthDim) {
                                selectedIdx = getIdx(mStrNoZero) ?? getIdx(mStr);
                                if (selectedIdx === undefined) return reject(new Error(`Měsíc ${m} v API nenalezen.`));
                            } else {
                                // Hledání správného ukazatele inflace ("stejnému měsíci předchozího roku")
                                for (const catId of Object.keys(labels)) {
                                    const labelText = String(labels[catId]).toLowerCase();
                                    if (labelText.includes('předchozího roku') || labelText.includes('stejnému měsíci')) {
                                        selectedIdx = getIdx(catId);
                                        break;
                                    }
                                }
                                // Záložní mechanismus: Pokud nenašel klíčové slovo, vezme index druhého sloupce
                                if ((selectedIdx === -1 || selectedIdx === undefined) && sizes[i] > 1 && sizes[i] <= 15) {
                                    if (Array.isArray(indices) && indices.length > 1) {
                                        selectedIdx = 1; // Druhá položka pole
                                    } else if (!Array.isArray(indices)) {
                                        // V mapě např. {"ID1": 0, "ID2": 1}
                                        for (const key in indices) {
                                            if (indices[key] === 1) {
                                                selectedIdx = 1;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }

                            if (selectedIdx === -1 || selectedIdx === undefined) selectedIdx = 0; // Defaultní hodnota (např. ČR)
                            targetIndices.push(selectedIdx);
                        }

                        // Matematický výpočet přesné souřadnice v 1D poli JSON-STATu
                        let flatIndex = 0;
                        let multiplier = 1;
                        for (let i = dimIds.length - 1; i >= 0; i--) {
                            flatIndex += targetIndices[i] * multiplier;
                            multiplier *= sizes[i];
                        }

                        const value = dataset.value[flatIndex];

                        if (value !== undefined && value !== null) {
                            resolve(value);
                        } else {
                            reject(new Error(`Data pro měsíc ${m}/${y} sice existují, ale hodnota v API je aktuálně prázdná.`));
                        }
                    } catch (e) {
                        reject(new Error("Chyba při parsování datového JSONu: " + e.message));
                    }
                },
                onerror: function () {
                    reject(new Error("Síťová chyba. Připojení k API ČSÚ se nezdařilo."));
                }
            });
        });
    }

    // HLAVNÍ VÝPOČTOVÝ MOTOR
    async function processFunds(targetDateStr, logContainer) {
        let y, m;
        if (targetDateStr.includes('.')) {
            const parts = targetDateStr.split('.');
            m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
        } else {
            const parts = targetDateStr.split('-');
            y = parseInt(parts[0], 10); m = parseInt(parts[1], 10);
        }
        const targetMonthKey = `${y}-${m - 1}`;
        let wasSomethingFilled = false;

        logContainer.innerHTML = '';

        // ==========================================
        // 1. CONSEQ FONDY (Původní stabilní logika z v4.0)
        // ==========================================
        // Zpracováváme pěkně jeden po druhém, aby se neotevřelo 6 záložek najednou a nezasekl se prohlížeč
        for (let fund of FUNDS) {
            const input = document.getElementById(fund.id);
            const logItem = document.createElement('div');
            logItem.className = 'text-xs py-1 border-b border-slate-700 font-mono';
            logContainer.appendChild(logItem);

            if (!input) {
                logItem.innerHTML = `<span class="text-rose-400">❌ ${fund.name}:</span> Nenalezeno políčko.`;
                continue;
            }
            if (input.value && input.value.trim() !== "") {
                logItem.innerHTML = `<span class="text-slate-400">⏭️ ${fund.name}:</span> Přeskočeno (již vyplněno).`;
                continue;
            }

            try {
                logItem.innerHTML = `<span class="text-sky-400">⏳ ${fund.name}:</span> Otevírám záložku na pozadí pro extrakci dat...`;

                // Stažení dat pomocí skryté záložky
                const data = await fetchFundDataViaTab(fund.url);

                if (!data || data.length === 0) {
                    throw new Error("Záložka nevrátila žádná data");
                }

                // 1. Zjištění výchozí hodnoty pro výpočet procent (první hodnota od 22.02.2024)
                let baseValue = data[0].value;
                for (let i = 0; i < data.length; i++) {
                    if (data[i].time >= BASE_DATE_UTC) {
                        baseValue = data[i].value;
                        break;
                    }
                }

                // 2. 1:1 REPLIKA ALGORITMU Z VAŠEHO FUNKČNÍHO SKRIPTU
                const targetDays = [];
                for (let i = 1; i < data.length; i++) {
                    const prevDate = new Date(data[i - 1].time);
                    const currDate = new Date(data[i].time);

                    const prevMonthKeyStr = `${prevDate.getUTCFullYear()}-${prevDate.getUTCMonth()}`;
                    const currMonthKeyStr = `${currDate.getUTCFullYear()}-${currDate.getUTCMonth()}`;

                    if (currMonthKeyStr !== prevMonthKeyStr) {
                        if (currDate.getUTCDate() === 1) {
                            targetDays.push({ time: data[i].time, value: data[i].value, monthKey: currMonthKeyStr });
                        } else {
                            targetDays.push({ time: data[i - 1].time, value: data[i - 1].value, monthKey: currMonthKeyStr });
                        }
                    }
                }

                if (data.length > 0) {
                    const lastDate = new Date(data[data.length - 1].time);
                    const lastMonthKeyStr = `${lastDate.getUTCFullYear()}-${lastDate.getUTCMonth()}`;
                    targetDays.push({ time: data[data.length - 1].time, value: data[data.length - 1].value, monthKey: lastMonthKeyStr });
                }

                // 3. Výběr a zápis
                const targetObj = targetDays.find(d => d.monthKey === targetMonthKey);

                if (baseValue !== null && targetObj) {
                    const perc = ((targetObj.value / baseValue) - 1) * 100;
                    const formatted = perc.toFixed(2);

                    const dDate = new Date(targetObj.time);
                    const foundTargetDateStr = `${dDate.getUTCDate()}.${dDate.getUTCMonth() + 1}.${dDate.getUTCFullYear()}`;

                    input.value = formatted;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));

                    logItem.innerHTML = `<span class="text-emerald-400">✅ ${fund.name}:</span> Zapsáno: <b>${formatted} %</b> (pro den ${foundTargetDateStr})`;
                    wasSomethingFilled = true;
                } else {
                    logItem.innerHTML = `<span class="text-orange-400">⚠️ ${fund.name}:</span> V grafu zatím nejsou data pro tento měsíc.`;
                }

            } catch (err) {
                logItem.innerHTML = `<span class="text-rose-400">❌ ${fund.name}:</span> Chyba: ${err.message}`;
            }
        }

        // ==========================================
        // 2. ČSÚ INFLACE (Staženo bleskově z API)
        // ==========================================
        const infInput = document.getElementById('inputInf');
        if (infInput && (!infInput.value || infInput.value.trim() === "")) {
            const logItem = document.createElement('div');
            logItem.className = 'text-xs py-1 border-b border-slate-700 font-mono';
            logContainer.appendChild(logItem);

            try {
                logItem.innerHTML = `<span class="text-sky-400">⏳ ČSÚ Inflace:</span> Stahuji hodnotu napřímo z API...`;

                const csuValue = await fetchCsuDataViaApi(y, m);

                infInput.value = csuValue.toString();
                infInput.dispatchEvent(new Event('input', { bubbles: true }));
                infInput.dispatchEvent(new Event('change', { bubbles: true }));

                logItem.innerHTML = `<span class="text-emerald-400">✅ ČSÚ Inflace:</span> Zapsáno: <b>${csuValue} %</b>`;
                wasSomethingFilled = true;
            } catch (err) {
                logItem.innerHTML = `<span class="text-rose-400">❌ ČSÚ Inflace:</span> Chyba: ${err.message}`;
            }
        } else if (infInput) {
            const logItem = document.createElement('div');
            logItem.className = 'text-xs py-1 border-b border-slate-700 font-mono text-slate-400';
            logItem.innerHTML = `⏭️ ČSÚ Inflace: Přeskočeno (již vyplněno).`;
            logContainer.appendChild(logItem);
        }

        return wasSomethingFilled;
    }

    // UI a LOGIKA TLAČÍTKA
    function initObserver() {
        const observer = new MutationObserver(() => {
            const modal = document.querySelector('#addModalContent');
            const form = document.querySelector('#addForm');

            if (modal && form && !document.getElementById('btn-conseq-automator')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'wrapper-conseq-automator';
                wrapper.className = 'mb-5 p-4 bg-slate-900 border border-sky-900/50 rounded-xl';

                const btn = document.createElement('button');
                btn.id = 'btn-conseq-automator';
                btn.type = 'button';
                btn.innerHTML = '🤖 Automaticky načíst hodnoty (Conseq + API)';
                btn.className = 'w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-lg transition-colors';

                const logContainer = document.createElement('div');
                logContainer.id = 'conseq-log-container';
                logContainer.className = 'mt-3 text-slate-300 overflow-y-hidden overflow-x-hidden transition-all duration-500';
                logContainer.style.maxHeight = '0px';
                logContainer.style.opacity = '0';

                wrapper.appendChild(btn);
                wrapper.appendChild(logContainer);

                btn.addEventListener('click', async () => {
                    const dateInput = document.querySelector('#inputDate');

                    if (!dateInput || !dateInput.value) {
                        alert('Vyberte prosím nejprve datum v poli Datum záznamu!');
                        return;
                    }

                    // Zobrazení logu
                    logContainer.style.maxHeight = '400px';
                    logContainer.style.opacity = '1';

                    const originalText = btn.innerHTML;
                    btn.innerHTML = '⏳ Otevírám postupně fondy a stahuji z API...';
                    btn.classList.replace('bg-sky-600', 'bg-slate-600');
                    btn.disabled = true;

                    try {
                        const filled = await processFunds(dateInput.value, logContainer);

                        if (filled) {
                            btn.innerHTML = '✅ Analýza dokončena. Data byla vyplněna!';
                            btn.classList.replace('bg-slate-600', 'bg-emerald-600');
                        } else {
                            btn.innerHTML = '⚠️ Analýza dokončena (pole mohou být již plná)';
                            btn.classList.replace('bg-slate-600', 'bg-orange-600');
                        }
                    } catch (e) {
                        btn.innerHTML = '❌ Došlo k nečekané chybě.';
                        btn.classList.replace('bg-slate-600', 'bg-rose-600');
                    } finally {
                        // Sbalení logu pro čisté UI formuláře
                        setTimeout(() => {
                            logContainer.style.maxHeight = '0px';
                            logContainer.style.opacity = '0';

                            btn.innerHTML = originalText;
                            btn.className = 'w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-lg transition-colors';
                            btn.disabled = false;
                        }, 3000);
                    }
                });

                const targetContainer = document.getElementById('inputF1');
                if (targetContainer && targetContainer.closest('.grid')) {
                    const gridParent = targetContainer.closest('.grid');
                    gridParent.parentNode.insertBefore(wrapper, gridParent);
                } else {
                    form.insertBefore(wrapper, form.firstChild);
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    initObserver();

})();