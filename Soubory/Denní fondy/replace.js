const fs = require('fs');
let file = fs.readFileSync('gas-denni-fondy.js', 'utf8');

file = file.replace(/case 'backfillFund':[\s\S]*?result = backfillOneFund\(params.fundId\);[\s\S]*?break;/, "case 'backfillFund':\n        var years = parseInt(params.years) || 1;\n        result = backfillOneFund(params.fundId, years);\n        break;");

file = file.replace(/function backfillOneFund\(fundId\) {/, "function backfillOneFund(fundId, years) {\n  years = years || 1;");

file = file.replace(/var cutoffDate = yearAgoDate\(\);/, "var startDate = new Date();\n  startDate.setFullYear(startDate.getFullYear() - years);\n  var cutoffDate = startDate.toISOString().substring(0, 10);");

let infReplacement = unction fetchAndSaveInflation() {
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
    // Nìkdy CNB zveøejòuje o mìsíc pozadu. Uložíme to pod aktuální mìsíc, protože nás zajímá aktuálnì platná hodnota pro aktuální denní kurzy.
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

//;

file = file.replace(/function fetchAndSaveInflation\(\) {[\s\S]*?return records;\n}\n\n\/\//, infReplacement);

fs.writeFileSync('gas-denni-fondy.js', file, 'utf8');
