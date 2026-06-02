// ╔══════════════════════════════════════════════════════════════════════╗
// ║       DENNÍ FONDY — Google Apps Script                              ║
// ║       Verze: 1.0 | Datum: 2026                                      ║
// ╠══════════════════════════════════════════════════════════════════════╣
// ║                                                                      ║
// ║  POSTUP NASAZENÍ:                                                    ║
// ║  ─────────────────                                                   ║
// ║  1. Otevřete https://script.google.com                               ║
// ║  2. Vytvořte nový projekt: "+ Nový projekt"                          ║
// ║  3. Vložte celý tento kód (přepište výchozí obsah)                   ║
// ║  4. Klikněte na ikonu ozubeného kola → "Nastavení projektu"          ║
// ║     Zapněte "Zobrazit soubor appsscript.json"                        ║
// ║  5. Nasadit → Nové nasazení:                                         ║
// ║       Typ: Webová aplikace                                           ║
// ║       Spustit jako: Já                                               ║
// ║       Kdo má přístup: Kdokoli                                        ║
// ║  6. Zkopírujte vygenerovanou URL webové aplikace                     ║
// ║  7. Vložte URL do fondy-config.js (klíč "gasUrl")                   ║
// ║  8. Nastavte automatický trigger (krok níže)                         ║
// ║                                                                      ║
// ║  NASTAVENÍ AUTOMATICKÉHO DENNÍHO TRIGGERU:                           ║
// ║  ─────────────────────────────────────────                           ║
// ║  1. V GAS editoru: Triggers (hodiny vlevo) → "+ Add Trigger"         ║
// ║  2. Function: dailyScrape                                            ║
// ║  3. Event source: Time-driven                                        ║
// ║  4. Type: Day timer                                                  ║
// ║  5. Time: 19:00 – 20:00 (Conseq aktualizuje kurzy odpoledne)        ║
// ║  6. Uložte                                                           ║
// ║                                                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── Nazvy Sheets listů ──────────────────────────────────────────────────
const SHEET_PRICES    = 'DenniPrices';
const SHEET_CONFIG    = 'DenniConfig';
const SHEET_INFLATION = 'DenniInflation';
const SHEET_FX        = 'DenniFX';

// ── Konstanty ────────────────────────────────────────────────────────────
const CONSEQ_BASE = 'https://www.conseq.cz';
const CNB_FX_URL  = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';
// Oficiální JSON-STAT API ČSÚ (CEN0101HT02 = "Indexy spotřebitelských cen,
// p.a. — všechny domácnosti"). Vrací JSON-STAT 2.0 strukturu.
const CSU_INF_URL = 'https://data.csu.gov.cz/api/dotaz/v1/data/vybery/CEN0101HT02?format=JSON_STAT';

// Maximální počet dní historických dat (backfill + zobrazení)
const MAX_HISTORY_DAYS = 400;

// ════════════════════════════════════════════════════════════════════════
// GET ENDPOINT — vrací data jako JSON
// ════════════════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || 'getAll';
    var result;

    switch (action) {
      case 'getAll':
        result = {
          prices:    getPricesData(),
          config:    getConfigData(),
          inflation: getInflationData()
        };
        break;
      case 'getPrices':
        result = getPricesData(params.from, params.to);
        break;
      case 'getConfig':
        result = getConfigData();
        break;
      case 'getInflation':
        result = getInflationData();
        break;
      case 'backfillMonth':
        result = backfillOneFundForMonth(params.fundId, params.ym);
        break;
      case 'backfillFund':
        result = backfillOneFund(params.fundId);
        break;
      case 'triggerManual':
        dailyScrape();
        result = { ok: true, message: 'Ruční scraping spuštěn' };
        break;
      default:
        result = { error: 'Neznámá akce: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return jsonResponse({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════
// POST ENDPOINT — ukládá data
// ════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var result;

    switch (body.action) {
      case 'syncConfig':
        result = syncConfigAction(body.fondy || []);
        break;
      case 'savePrice':
        result = savePriceRow(body.date, body.prices);
        break;
      default:
        result = { error: 'Neznámá akce: ' + body.action };
    }

    return jsonResponse(result);
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════
// SYNCHRONIZACE KONFIGURACE FONDŮ
// Zjistí productId pro nové/chybějící fondy a uloží konfiguraci.
// ════════════════════════════════════════════════════════════════════════
function syncConfigAction(fondy) {
  var existing = getConfigMap();
  var updated  = [];

  for (var i = 0; i < fondy.length; i++) {
    var f = fondy[i];
    if (!f.active || !f.slug) {
      updated.push(f);
      continue;
    }

    // Zjistit productId — pokud už ho máme v Sheetu, použijeme ho
    var cached = existing[f.id];
    if (cached && cached.productId) {
      f.productId = cached.productId;
    } else {
      Logger.log('Zjišťuji productId pro ' + f.slug);
      f.productId = discoverProductId(f.slug);
      if (f.productId) {
        Logger.log('Nalezeno productId=' + f.productId + ' pro ' + f.slug);
      } else {
        Logger.log('WARN: productId nenalezeno pro ' + f.slug);
      }
    }
    updated.push(f);
  }

  saveConfigData(updated);
  return { ok: true, fondy: updated };
}

// ── Zjistí productId ze stránky fondu na Conseq ──────────────────────
function discoverProductId(slug) {
  try {
    var url  = CONSEQ_BASE + '/investice/prehled-fondu/' + slug;
    var opts = { muteHttpExceptions: true, followRedirects: true };
    var resp = UrlFetchApp.fetch(url, opts);

    if (resp.getResponseCode() !== 200) {
      Logger.log('discoverProductId HTTP ' + resp.getResponseCode() + ' pro ' + slug);
      return null;
    }

    var html  = resp.getContentText('UTF-8');
    // Hledáme odkaz na historické ceny: Pricehist.ashx?productid=8275
    var match = html.match(/productid=(\d+)/i);
    if (match) return parseInt(match[1]);

    // Záloha: hledáme i v skrytých formulářových polích
    var match2 = html.match(/addfundcomparison=(\d+)/i);
    return match2 ? parseInt(match2[1]) : null;

  } catch (err) {
    Logger.log('discoverProductId error pro ' + slug + ': ' + err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
// DENNÍ AUTOMATICKÝ SCRAPING (spouštěn triggerem každý den v 19:00)
// ════════════════════════════════════════════════════════════════════════
function dailyScrape() {
  Logger.log('=== dailyScrape START ' + new Date().toISOString() + ' ===');

  var config  = getConfigData();
  var todayStr = todayDate();
  var prices  = {};
  var fxRates = fetchFxRates();

  for (var i = 0; i < config.length; i++) {
    var f = config[i];
    if (!f.active || !f.productId) continue;

    try {
      var history = fetchPriceHistory(f.productId);
      if (!history.length) {
        Logger.log('WARN: Prázdná history pro ' + f.name + ' (productId=' + f.productId + ')');
        continue;
      }

      // Bereme nejnovější cenu — může být z dnešního nebo posledního obchodního dne
      var last = history[history.length - 1];
      Logger.log(f.name + ': lastDate=' + last.date + ' price=' + last.price + ' currency=' + last.currency);

      // Přepočet na CZK
      var czk = toCZK(last.price, last.currency, fxRates);
      prices[f.id] = czk;

    } catch (err) {
      Logger.log('ERROR při scraping ' + f.name + ': ' + err.message);
    }
  }

  if (Object.keys(prices).length > 0) {
    savePriceRow(todayStr, prices);
    Logger.log('Uloženo pro ' + todayStr + ': ' + JSON.stringify(prices));
  } else {
    Logger.log('WARN: Žádné kurzy k uložení pro ' + todayStr);
  }

  // Měsíční inflace (pokud je nový měsíc)
  fetchAndSaveInflation();

  Logger.log('=== dailyScrape END ===');
}

// ════════════════════════════════════════════════════════════════════════

function backfillOneFundForMonth(fundId, ym) {
  var config = getConfigData();
  var fond   = null;
  for (var i = 0; i < config.length; i++) {
    if (config[i].id === fundId && config[i].active) {
      fond = config[i];
      break;
    }
  }

  if (!fond) return { ok: false, error: 'Fond nenalezen' };
  if (!fond.productId) return { ok: false, error: 'Chybí productId' };

  var history = fetchPriceHistory(fond.productId);
  if (!history.length) return { ok: false, error: 'Žádná data' };

  // Filter only days matching YYYY-MM
  var filtered = history.filter(function(r) { return r.date.indexOf(ym) === 0; });
  if (!filtered.length) return { ok: false, error: 'Žádná data pro ' + ym };

  var fxRates = fetchFxRates();
  var priceSheet = getOrCreatePriceSheet();
  var existing   = getPricesMap();

  var saved = 0;
  for (var j = 0; j < filtered.length; j++) {
    var r = filtered[j];
    var czk = (r.currency === 'CZK') ? r.price : convertToCzk(r.price, r.currency, r.date, fxRates);
    
    // Zápis / Update
    var exRow = existing[r.date];
    if (exRow) {
      // update
      var hdrs = priceSheet.getRange(1, 1, 1, priceSheet.getLastColumn()).getValues()[0];
      var colIdx = hdrs.indexOf(fundId) + 1;
      if (colIdx > 0) {
        priceSheet.getRange(exRow, colIdx).setValue(czk);
        saved++;
      }
    } else {
      // append
      var rowData = { date: r.date };
      rowData[fundId] = czk;
      appendPriceRow(priceSheet, rowData);
      existing[r.date] = priceSheet.getLastRow();
      saved++;
    }
  }

  return { ok: true, success: true, fundId: fundId, count: saved };
}

// BACKFILL JEDNOHO FONDU (voláno z HTML přes GET ?action=backfillFund)
// Stáhne historii za poslední rok a uloží do Sheetu.
// ════════════════════════════════════════════════════════════════════════
function backfillOneFund(fundId) {
  var config = getConfigData();
  var fond   = null;
  for (var i = 0; i < config.length; i++) {
    if (config[i].id === fundId && config[i].active) {
      fond = config[i];
      break;
    }
  }

  if (!fond) return { ok: false, error: 'Fond nenalezen v konfiguraci: ' + fundId };
  if (!fond.productId) return { ok: false, error: 'Fond nemá productId — nejdříve spusťte Synchronizovat fondy' };

  Logger.log('Backfill START pro ' + fond.name + ' (productId=' + fond.productId + ')');

  var history = fetchPriceHistory(fond.productId);
  if (!history.length) return { ok: false, error: 'Žádná data z Conseq pro productId=' + fond.productId };

  // Filtr na poslední rok
  var cutoffDate = yearAgoDate();
  var filtered   = history.filter(function(r) { return r.date >= cutoffDate; });

  Logger.log('Backfill ' + fond.name + ': celkem=' + history.length + ', po filtru=' + filtered.length);

  // Kurzy ČNB (stahujeme jen jednou)
  var fxRates = fetchFxRates();

  // Uložit každý den — dávkově pro rychlost
  var priceSheet = getOrCreatePriceSheet();
  var existing   = getPricesMap(); // { date: rowIndex }

  var saved = 0;
  for (var j = 0; j < filtered.length; j++) {
    var rec = filtered[j];
    var czk = toCZK(rec.price, rec.currency, fxRates);

    if (existing[rec.date]) {
      // Aktualizovat existující řádek — jen tento fond
      updatePriceCell(priceSheet, existing[rec.date], fond.id, czk);
    } else {
      // Přidat nový řádek
      var rowData = { date: rec.date };
      rowData[fond.id] = czk;
      appendPriceRow(priceSheet, rowData);
      existing[rec.date] = true; // zaznamenat
    }
    saved++;
  }

  Logger.log('Backfill DONE pro ' + fond.name + ': uloženo=' + saved);
  return { ok: true, fundId: fundId, count: saved };
}

// ════════════════════════════════════════════════════════════════════════
// STAHOVÁNÍ KURZŮ Z CONSEQ (Pricehist.ashx)
// ════════════════════════════════════════════════════════════════════════
function fetchPriceHistory(productId) {
  var url  = CONSEQ_BASE + '/Conseq/Pricehist.ashx?productid=' + productId + '&culture=cs-CZ';
  var opts = { muteHttpExceptions: true };

  try {
    var resp = UrlFetchApp.fetch(url, opts);
    var code = resp.getResponseCode();

    if (code !== 200) {
      Logger.log('fetchPriceHistory HTTP ' + code + ' pro productId=' + productId);
      return [];
    }

    // Zjistíme Content-Type pro volbu parseru
    var contentType = resp.getHeaders()['Content-Type'] || '';
    var content     = resp.getContentText('UTF-8');

    Logger.log('Pricehist response: type=' + contentType.substring(0, 50) + ' len=' + content.length);

    // Zkusit CSV parsing (nejčastější formát)
    var result = parsePriceCSV(content);
    if (result.length > 0) return result;

    // Záloha: HTML tabulka
    result = parsePriceHTML(content);
    return result;

  } catch (err) {
    Logger.log('fetchPriceHistory error pro ' + productId + ': ' + err.message);
    return [];
  }
}

// Parsuje CSV historii cen (Conseq formát)
function parsePriceCSV(content) {
  if (!content || content.trim().length < 10) return [];

  var lines = content.trim().replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2) return [];

  // Detekce oddělovače
  var firstLine = lines[0];
  var delimiter = ';';
  if (firstLine.indexOf(';') === -1 && firstLine.indexOf(',') !== -1) delimiter = ',';
  if (firstLine.indexOf('\t') !== -1) delimiter = '\t';

  var results = [];
  var headerSkipped = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var parts = line.split(delimiter).map(function(p) { return p.trim().replace(/^"|"$/g, ''); });
    if (parts.length < 2) continue;

    // Přeskočit hlavičku
    if (!headerSkipped) {
      var lc = parts[0].toLowerCase();
      if (lc === 'datum' || lc === 'date' || lc === 'dátum' || isNaN(parseFloat(parts[1].replace(',', '.')))) {
        headerSkipped = true;
        continue;
      }
    }

    // Parsovat datum
    var dateStr = parseConseqDate(parts[0]);
    if (!dateStr) continue;

    // Parsovat cenu (Czech: 1 234,5678 → 1234.5678)
    var priceRaw = parts[1].replace(/\s/g, '').replace(',', '.');
    var price = parseFloat(priceRaw);
    if (isNaN(price) || price <= 0) continue;

    // Měna (3. sloupec pokud existuje)
    var currency = (parts[2] || 'CZK').trim().toUpperCase() || 'CZK';
    if (currency.length !== 3) currency = 'CZK'; // fallback

    results.push({ date: dateStr, price: price, currency: currency });
  }

  return results.sort(function(a, b) { return a.date.localeCompare(b.date); });
}

// Záložní parser HTML tabulky
function parsePriceHTML(content) {
  if (!content || content.indexOf('<tr') === -1) return [];
  var results = [];

  // Extrahujeme řádky tabulky
  var rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  var tagRe  = /<[^>]+>/g;

  var rowMatch;
  var isHeader = true;
  while ((rowMatch = rowRe.exec(content)) !== null) {
    var rowHtml = rowMatch[1];
    var cells   = [];
    var cellMatch;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(tagRe, '').trim());
    }
    if (cells.length < 2) continue;
    if (isHeader) { isHeader = false; continue; }

    var dateStr = parseConseqDate(cells[0]);
    var price   = parseFloat(cells[1].replace(/\s/g, '').replace(',', '.'));
    var currency = cells[2] ? cells[2].trim().toUpperCase() : 'CZK';

    if (dateStr && !isNaN(price) && price > 0) {
      results.push({ date: dateStr, price: price, currency: currency.length === 3 ? currency : 'CZK' });
    }
  }

  return results.sort(function(a, b) { return a.date.localeCompare(b.date); });
}

// Parsuje různé formáty data na YYYY-MM-DD
function parseConseqDate(s) {
  if (!s) return null;
  s = s.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD.MM.YYYY nebo D.M.YYYY
  var m1 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m1) return m1[3] + '-' + pad2(m1[2]) + '-' + pad2(m1[1]);

  // DD/MM/YYYY
  var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return m2[3] + '-' + pad2(m2[2]) + '-' + pad2(m2[1]);

  return null;
}

// ════════════════════════════════════════════════════════════════════════
// KURZY ČNB (pro přepočet cizích měn na CZK)
// ════════════════════════════════════════════════════════════════════════
function fetchFxRates() {
  var rates = { CZK: 1 };
  try {
    var resp = UrlFetchApp.fetch(CNB_FX_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return rates;

    var lines = resp.getContentText('UTF-8').split('\n');
    // Formát: datum #kurz\nzemě|měna|množství|kód|kurz
    for (var i = 2; i < lines.length; i++) {
      var parts = lines[i].split('|');
      if (parts.length < 5) continue;
      var amount = parseFloat(parts[2]);
      var code   = parts[3].trim().toUpperCase();
      var rate   = parseFloat(parts[4].replace(',', '.'));
      if (!isNaN(rate) && !isNaN(amount) && amount > 0) {
        rates[code] = rate / amount; // CZK za 1 jednotku měny
      }
    }
    Logger.log('FX rates loaded: ' + Object.keys(rates).length + ' měn');
  } catch (err) {
    Logger.log('fetchFxRates error: ' + err.message);
  }
  return rates;
}

// Přepočítá cenu na CZK
function toCZK(price, currency, fxRates) {
  if (!currency || currency === 'CZK') return price;
  var rate = fxRates[currency.toUpperCase()];
  if (!rate) {
    Logger.log('WARN: Neznámá měna ' + currency + ', ponecháváme původní hodnotu');
    return price;
  }
  return price * rate;
}

// ════════════════════════════════════════════════════════════════════════
// INFLACE ČSÚ — oficiální JSON-STAT 2.0 API
// ════════════════════════════════════════════════════════════════════════
// Endpoint vrací dataset CEN0101HT02 (Index spotř. cen, meziroční změna p.a.).
// JSON-STAT struktura: { dataset: { value: [], dimension: { ... } } }, kde
// pole `value` je linearizováno přes všechny dimenze. Z dimenze CASOVA_OBDOBI
// získáme řady měsíčních ymStringů; index v poli = pozice v dimenze.
function fetchAndSaveInflation() {
  try {
    var resp = UrlFetchApp.fetch(CSU_INF_URL, {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('CSU API HTTP ' + resp.getResponseCode());
      return;
    }
    var json = JSON.parse(resp.getContentText('UTF-8'));

    // JSON-STAT může být zabalený v 'dataset' nebo přímo. Zkusíme obě varianty.
    var ds = json.dataset || json;
    if (!ds || !ds.value || !ds.dimension) {
      Logger.log('CSU API: neočekávaná struktura ' + Object.keys(json).join(','));
      return;
    }
    var values = ds.value;
    if (Array.isArray(values)) {
      // OK
    } else if (typeof values === 'object') {
      // Sparse: { "0": x, "5": y }. Převedeme na husté pole.
      var dense = [];
      Object.keys(values).forEach(function(k) { dense[Number(k)] = values[k]; });
      values = dense;
    }

    // Najdeme dimenzi pro čas (nejčastěji "obdobi", "Časové období", "CASOVE_OBDOBI").
    var dimKey = null;
    Object.keys(ds.dimension).forEach(function(k) {
      if (/obdob|period|time|cas/i.test(k)) dimKey = k;
    });
    if (!dimKey) dimKey = ds.id && ds.id[ds.id.length - 1]; // často poslední ID je čas
    if (!dimKey) { Logger.log('CSU API: nelze najít časovou dimenzi'); return; }

    var dim = ds.dimension[dimKey];
    var index = dim.category && dim.category.index;
    var labels = dim.category && dim.category.label;
    if (!index) { Logger.log('CSU API: chybí category.index'); return; }

    // Převod kódů (např. "M202604") → "YYYY-MM"
    var entries = []; // {pos, ym}
    Object.keys(index).forEach(function(code) {
      var pos = (typeof index[code] === 'number') ? index[code] : Number(index[code]);
      var ym = csuCodeToYearMonth(code, labels ? labels[code] : null);
      if (ym) entries.push({ pos: pos, ym: ym });
    });

    // Vytáhneme hodnoty na příslušných pozicích.
    var records = entries
      .map(function(e) { return { yearMonth: e.ym, inflation_pa: Number(values[e.pos]) }; })
      .filter(function(r) { return r.yearMonth && !isNaN(r.inflation_pa); });

    if (!records.length) { Logger.log('CSU API: žádné záznamy'); return; }

    var sheet = getOrCreateSheet(SHEET_INFLATION);
    getOrSetHeaders(sheet, ['yearMonth', 'inflation_pa']);
    var data = sheet.getDataRange().getValues();
    var existing = {};
    for (var i = 1; i < data.length; i++) existing[data[i][0]] = i + 1;

    records.forEach(function(rec) {
      if (existing[rec.yearMonth]) {
        sheet.getRange(existing[rec.yearMonth], 2).setValue(rec.inflation_pa);
      } else {
        sheet.appendRow([rec.yearMonth, rec.inflation_pa]);
      }
    });
    Logger.log('CSU API: uloženo ' + records.length + ' záznamů');
  } catch (err) {
    Logger.log('fetchAndSaveInflation error: ' + err.message);
  }
}

// Převod CSU časového kódu na YYYY-MM.
// Časté formáty:
//   - "M202604" (měsíční)
//   - "2026-04"
//   - label string "duben 2026" / "Apr 2026" — pokud kód není parsovatelný.
function csuCodeToYearMonth(code, label) {
  if (!code) return null;
  var s = String(code);
  var m;
  // M202604
  m = s.match(/^M(\d{4})(\d{2})$/);
  if (m) return m[1] + '-' + m[2];
  // 2026-04 / 2026M04
  m = s.match(/^(\d{4})[-M](\d{2})$/);
  if (m) return m[1] + '-' + m[2];
  // 202604
  m = s.match(/^(\d{4})(\d{2})$/);
  if (m) return m[1] + '-' + m[2];
  // Fallback: parsovat label
  if (label) {
    var months = { 'leden':'01','únor':'02','březen':'03','duben':'04','květen':'05','červen':'06','červenec':'07','srpen':'08','září':'09','říjen':'10','listopad':'11','prosinec':'12' };
    var lbl = String(label).toLowerCase();
    var monthName = Object.keys(months).find(function(n) { return lbl.indexOf(n) !== -1; });
    var yearM = lbl.match(/(20\d{2})/);
    if (monthName && yearM) return yearM[1] + '-' + months[monthName];
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════
// SHEET OPERACE — Prices
// ════════════════════════════════════════════════════════════════════════
function getOrCreatePriceSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_PRICES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PRICES);
    // Záhlaví: date, f1, f2, ..., f10
    var headers = ['date'];
    for (var i = 1; i <= 10; i++) headers.push('f' + i);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Vrátí data z Prices sheetu jako pole objektů { date, f1, ..., f10 }
function getPricesData(from, to) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRICES);
  if (!sheet) return [];

  var data    = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var results = [];
  var cutoff  = from || '';
  var maxDate = to   || '';

  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (headers[j] === 'date') {
        // Převést datum na string YYYY-MM-DD
        if (val instanceof Date) {
          row.date = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          row.date = String(val).trim();
        }
      } else {
        row[headers[j]] = (val === '' || val === null || val === undefined) ? null : parseFloat(val);
      }
    }
    if (!row.date || row.date === '') continue;
    if (cutoff  && row.date < cutoff)  continue;
    if (maxDate && row.date > maxDate) continue;

    results.push(row);
  }

  return results.sort(function(a, b) { return b.date.localeCompare(a.date); }); // nejnovější první
}

// Vrátí mapu date→rowIndex pro rychlé vyhledávání
function getPricesMap() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRICES);
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  var map  = {};
  for (var i = 1; i < data.length; i++) {
    var d = data[i][0];
    if (d instanceof Date) d = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    else d = String(d).trim();
    if (d) map[d] = i + 1; // 1-indexed řádek v Sheetu
  }
  return map;
}

// Uloží nebo aktualizuje řádek s cenami pro dané datum
function savePriceRow(date, prices) {
  if (!date) return { ok: false, error: 'Chybí datum' };

  var sheet   = getOrCreatePriceSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                     .map(function(h) { return String(h).trim(); });
  var map     = getPricesMap();

  if (map[date]) {
    // Aktualizovat existující řádek
    var rowIdx = map[date];
    Object.keys(prices).forEach(function(fundId) {
      var colIdx = headers.indexOf(fundId) + 1;
      if (colIdx > 0) sheet.getRange(rowIdx, colIdx).setValue(prices[fundId]);
    });
  } else {
    // Přidat nový řádek
    var row = new Array(headers.length).fill('');
    row[0]  = date;
    Object.keys(prices).forEach(function(fundId) {
      var colIdx = headers.indexOf(fundId);
      if (colIdx > 0) row[colIdx] = prices[fundId];
    });
    sheet.appendRow(row);
  }

  return { ok: true };
}

// Aktualizuje konkrétní buňku (fond) v existujícím řádku
function updatePriceCell(sheet, rowIdx, fundId, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                     .map(function(h) { return String(h).trim(); });
  var colIdx  = headers.indexOf(fundId) + 1;
  if (colIdx > 0) sheet.getRange(rowIdx, colIdx).setValue(value);
}

// Přidá nový řádek (použije se z backfill dávkování)
function appendPriceRow(sheet, rowData) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                     .map(function(h) { return String(h).trim(); });
  var row = new Array(headers.length).fill('');
  Object.keys(rowData).forEach(function(key) {
    var idx = headers.indexOf(key);
    if (idx >= 0) row[idx] = rowData[key];
  });
  sheet.appendRow(row);
}

// ════════════════════════════════════════════════════════════════════════
// SHEET OPERACE — Config
// ════════════════════════════════════════════════════════════════════════
function getConfigData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    if (obj.id) {
      obj.active = (obj.active === true || obj.active === 'true' || obj.active === 1);
      obj.productId = obj.productId ? parseInt(obj.productId) : null;
      results.push(obj);
    }
  }
  return results;
}

function getConfigMap() {
  var config = getConfigData();
  var map = {};
  config.forEach(function(f) { if (f.id) map[f.id] = f; });
  return map;
}

function saveConfigData(fondy) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONFIG);
  }
  sheet.clearContents();
  var headers = ['id', 'name', 'slug', 'productId', 'color', 'active'];
  var rows    = [headers];
  fondy.forEach(function(f) {
    rows.push([f.id, f.name, f.slug, f.productId || '', f.color, f.active ? 'true' : 'false']);
  });
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
}

// ════════════════════════════════════════════════════════════════════════
// SHEET OPERACE — Inflation
// ════════════════════════════════════════════════════════════════════════
function getInflationData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INFLATION);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var ym  = String(data[i][0]).trim();
    var val = parseFloat(data[i][1]);
    if (ym && !isNaN(val)) results.push({ yearMonth: ym, inflation_pa: val });
  }
  return results;
}

// ════════════════════════════════════════════════════════════════════════
// POMOCNÉ FUNKCE
// ════════════════════════════════════════════════════════════════════════
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function getOrSetHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  return headers;
}

function todayDate() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function yearAgoDate() {
  var d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function pad2(s) {
  return String(s).padStart(2, '0');
}

// ════════════════════════════════════════════════════════════════════════
// MANUÁLNÍ TESTOVACÍ FUNKCE
// Spusťte tyto funkce přímo v GAS editoru pro ověření funkčnosti
// ════════════════════════════════════════════════════════════════════════

/** Otestuje zjištění productId pro World Fund */
function testDiscoverProductId() {
  var result = discoverProductId('ff-world-fund-hedged-czk');
  Logger.log('World Fund productId: ' + result);
  // Očekáváno: 8275
}

/** Otestuje stažení kurzů pro World Fund */
function testFetchPriceHistory() {
  var history = fetchPriceHistory(8275);
  Logger.log('Počet záznamů: ' + history.length);
  if (history.length > 0) {
    Logger.log('Nejstarší: ' + JSON.stringify(history[0]));
    Logger.log('Nejnovější: ' + JSON.stringify(history[history.length - 1]));
  }
}

/** Otestuje celý denní scraping */
function testDailyScrape() {
  dailyScrape();
}

/** Zobrazí aktuální konfiguraci */
function testGetConfig() {
  var config = getConfigData();
  Logger.log('Konfigurace: ' + JSON.stringify(config));
}

/** Otestuje kurzy ČNB */
function testFxRates() {
  var rates = fetchFxRates();
  Logger.log('EUR: ' + rates['EUR']);
  Logger.log('USD: ' + rates['USD']);
}
