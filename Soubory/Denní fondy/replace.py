# -*- coding: utf-8 -*-
import re

with open('gas-denni-fondy.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace case 'backfillFund'
content = re.sub(
    r"case 'backfillFund':[\s\S]*?result = backfillOneFund\(params.fundId\);[\s\S]*?break;",
    "case 'backfillFund':\n        var years = parseInt(params.years) || 1;\n        result = backfillOneFund(params.fundId, years);\n        break;",
    content
)

# Replace function backfillOneFund signature
content = re.sub(
    r"function backfillOneFund\(fundId\) \{",
    "function backfillOneFund(fundId, years) {\n  years = years || 1;",
    content
)

# Replace yearAgoDate
content = re.sub(
    r"var cutoffDate = yearAgoDate\(\);",
    "var startDate = new Date();\n  startDate.setFullYear(startDate.getFullYear() - years);\n  var cutoffDate = startDate.toISOString().substring(0, 10);",
    content
)

inf_replacement = '''function fetchAndSaveInflation() {
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

# Extract the block to replace
start_idx = content.find('function fetchAndSaveInflation() {')
end_idx = content.find('return records;\n}\n\n//')
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + inf_replacement + content[end_idx + 18:]

with open('gas-denni-fondy.js', 'w', encoding='utf-8') as f:
    f.write(content)
