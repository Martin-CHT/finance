import json
import codecs

# Read the JSON-encoded string from the file
with codecs.open('gas-denni-fondy-restored.js', 'r', encoding='utf-8') as f:
    raw_str = f.read().strip()

# Safely evaluate the JSON string
try:
    if raw_str.startswith('"') and raw_str.endswith('"'):
        # It's a JSON string, decode it
        code = json.loads(raw_str)
    else:
        # It's just raw code (unlikely based on previous evidence)
        code = raw_str
except Exception as e:
    # Maybe it's missing quotes?
    code = json.loads('"' + raw_str + '"')

# Apply the replacements
code = code.replace(
    "case 'backfillFund':\n        result = backfillOneFund(params.fundId);\n        break;",
    "case 'backfillFund':\n        var years = parseInt(params.years) || 1;\n        result = backfillOneFund(params.fundId, years);\n        break;"
)

code = code.replace(
    "function backfillOneFund(fundId) {\n  var config = getConfigData();",
    "function backfillOneFund(fundId, years) {\n  years = years || 1;\n  var config = getConfigData();"
)

code = code.replace(
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
    // Někdy CNB zveřejňuje o měsíc pozadu. Uložíme to pod aktuální měsíc, protože nás zajímá aktuálně platná hodnota pro aktuální denní kurzy.
    var ymStr = pad2(now.getFullYear()) + '-' + pad2(now.getMonth() + 1);
    
    var sheet = getOrCreateSheet(SHEET_INFLATION);
    getOrSetHeaders(sheet, ['yearMonth', 'inflation_pa']);
    var data = sheet.getDataRange().getValues();
    
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === ymStr) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) {
      sheet.appendRow([ymStr, val]);
    } else {
      sheet.getRange(rowIdx, 2).setValue(val);
    }
    Logger.log('Inflace CNB uložena: ' + ymStr + ' = ' + val + '%');
    
  } catch (err) {
    Logger.log('fetchAndSaveInflation error: ' + err.message);
  }
}

//'''
start_idx = code.find('function fetchAndSaveInflation() {')
end_idx = code.find('return records;\n}\n\n//')
if start_idx != -1 and end_idx != -1:
    code = code[:start_idx] + inf_repl + code[end_idx + 18:]

with codecs.open('gas-denni-fondy.js', 'w', 'utf-8-sig') as out:
    out.write(code)

print("Done restoring and patching")
