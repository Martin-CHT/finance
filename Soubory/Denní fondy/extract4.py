import codecs

with open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\gas-denni-fondy.js', 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8', errors='replace')

text = text.replace(
    "case 'backfillFund':\n        result = backfillOneFund(params.fundId);\n        break;",
    "case 'backfillFund':\n        var years = parseInt(params.years) || 1;\n        result = backfillOneFund(params.fundId, years);\n        break;"
)

text = text.replace(
    "function backfillOneFund(fundId) {\n  var config = getConfigData();",
    "function backfillOneFund(fundId, years) {\n  years = years || 1;\n  var config = getConfigData();"
)

text = text.replace(
    "var cutoffDate = yearAgoDate();",
    "var startDate = new Date();\n  startDate.setFullYear(startDate.getFullYear() - years);\n  var cutoffDate = startDate.toISOString().substring(0, 10);"
)

inf_repl = '''function fetchAndSaveInflation() {
  try {
    var url = 'https://www.cnb.cz/cs/';
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Inflace: HTTP ' + resp.getResponseCode());
      return;
    }
    
    var html = resp.getContentText('UTF-8');
    var match = html.match(/<h2>Inflace<\\/h2>[\\s\\S]*?data-value="([\\d.]+)"/);
    if (!match) {
      Logger.log('Inflace: Hodnota nenalezena na webu CNB');
      return;
    }
    
    var val = parseFloat(match[1]);
    if (isNaN(val)) return;
    
    var now = new Date();
    var ym = pad2(now.getFullYear()) + '-' + pad2(now.getMonth() + 1);
    
    var sheet = getOrCreateSheet(SHEET_INFLATION);
    getOrSetHeaders(sheet, ['yearMonth', 'inflation_pa']);
    var data = sheet.getDataRange().getValues();
    
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === ym) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) {
      sheet.appendRow([ym, val]);
    } else {
      sheet.getRange(rowIdx, 2).setValue(val);
    }
    Logger.log('Inflace CNB uložena: ' + ym + ' = ' + val + '%');
    
  } catch (err) {
    Logger.log('fetchAndSaveInflation error: ' + err.message);
  }
}

//'''

start_idx = text.find('function fetchAndSaveInflation() {')
end_idx = text.find('return records;\n}\n\n//')
if start_idx != -1 and end_idx != -1:
    text = text[:start_idx] + inf_repl + text[end_idx + 18:]

with codecs.open('gas-denni-fondy.js', 'w', 'utf-8-sig') as f:
    f.write(text)

print("Done")
