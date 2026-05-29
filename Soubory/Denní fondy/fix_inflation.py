import codecs

with codecs.open('gas-denni-fondy.js', 'r', encoding='utf-8') as f:
    code = f.read()

old_fetchInflation = """function fetchAndSaveInflation() {
  try {
    var resp = UrlFetchApp.fetch(CSU_INF_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Inflace: HTTP ' + resp.getResponseCode());
      return;
    }

    var json    = JSON.parse(resp.getContentText('UTF-8'));
    var sheet   = getOrCreateSheet(SHEET_INFLATION);
    var headers = getOrSetHeaders(sheet, ['yearMonth', 'inflation_pa']);
    var data    = sheet.getDataRange().getValues();

    // Najít existující měsíce
    var existing = {};
    for (var i = 1; i < data.length; i++) {
      if (data[i][0]) existing[data[i][0]] = i + 1; // 1-indexed row
    }

    // Parsovat ČSÚ JSON — různé struktury
    var records = parseCSUInflation(json);

    for (var j = 0; j < records.length; j++) {
      var rec = records[j];
      if (existing[rec.yearMonth]) {
        // Aktualizovat
        sheet.getRange(existing[rec.yearMonth], 2).setValue(rec.inflation_pa);
      } else {
        // Přidat
        sheet.appendRow([rec.yearMonth, rec.inflation_pa]);
      }
    }

    Logger.log('Inflace uložena: ' + records.length + ' záznamů');
  } catch (err) {
    Logger.log('fetchAndSaveInflation error: ' + err.message);
  }
}

function parseCSUInflation(json) {
  var records = [];
  try {
    // ČSÚ API vrací data v různých strukturách podle endpointu
    var items = json.data || json.Data || json.rows || [];
    if (!Array.isArray(items)) {
      // Zkusit jinou strukturu
      var keys = Object.keys(json);
      for (var k = 0; k < keys.length; k++) {
        if (Array.isArray(json[keys[k]])) { items = json[keys[k]]; break; }
      }
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      // Hledáme klíče pro datum a hodnotu
      var ym  = item.yearMonth || item.YearMonth || item.period || item.Period || item.datum || item.Datum;
      var val = item.value || item.Value || item.hodnota || item.Hodnota || item.inflation || item.inflace;

      if (ym && val !== undefined) {
        // Normalizovat yearMonth na YYYY-MM
        var ymStr = String(ym);
        if (/^\d{4}$/.test(ymStr)) continue; // jen rok
        if (/^\d{4}-\d{2}$/.test(ymStr)) {
          records.push({ yearMonth: ymStr, inflation_pa: parseFloat(val) });
        }
      }
    }
  } catch (err) {
    Logger.log('parseCSUInflation error: ' + err.message);
  }
  return records;
}"""

new_fetchInflation = """function fetchAndSaveInflation() {
  try {
    var resp = UrlFetchApp.fetch('https://www.kurzy.cz/makroekonomika/inflace/', { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return;
    
    var html = resp.getContentText('windows-1250');
    var sheet = getOrCreateSheet(SHEET_INFLATION);
    var headers = getOrSetHeaders(sheet, ['yearMonth', 'inflation_pa']);
    var data = sheet.getDataRange().getValues();

    var existing = {};
    for (var i = 1; i < data.length; i++) {
      existing[data[i][0]] = i + 1;
    }

    var regex = /<td>(\\d{1,2})\\.\\s*(\\d{4})<\\/td>[\\s\\S]*?<td>([0-9,]+)\\s*%<\\/td>/g;
    var match;
    var records = [];
    
    while ((match = regex.exec(html)) !== null) {
      var m = match[1].padStart(2, '0');
      var y = match[2];
      var val = parseFloat(match[3].replace(',', '.'));
      records.push({ yearMonth: y + '-' + m, inflation_pa: val });
    }

    for (var j = 0; j < records.length; j++) {
      var rec = records[j];
      if (existing[rec.yearMonth]) {
        sheet.getRange(existing[rec.yearMonth], 2).setValue(rec.inflation_pa);
      } else {
        sheet.appendRow([rec.yearMonth, rec.inflation_pa]);
      }
    }
  } catch (err) {
    Logger.log('fetchAndSaveInflation error: ' + err.message);
  }
}"""

if old_fetchInflation in code:
    code = code.replace(old_fetchInflation, new_fetchInflation)
    with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print("Inflation logic updated!")
else:
    print("Could not find old_fetchInflation in code.")
