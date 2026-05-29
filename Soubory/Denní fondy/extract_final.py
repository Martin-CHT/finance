import json
import codecs

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'write_to_file' in line and 'gas-denni-fondy.js' in line:
            try:
                data = json.loads(line)
                tool_calls = data.get('tool_calls', [])
                if not tool_calls: continue
                
                tool = tool_calls[0]
                if tool['name'] != 'write_to_file': continue
                
                target = tool['args'].get('TargetFile', '')
                if 'gas-denni-fondy.js' not in target: continue
                
                code_str = tool['args']['CodeContent']
                # Try to parse if it's double encoded
                try:
                    if code_str.startswith('"'):
                        code = json.loads(code_str)
                    else:
                        code = code_str
                except:
                    code = code_str
                
                if 'function backfillOneFund' not in code: continue
                
                # Apply the replacements manually in python
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
                start_idx = code.find('function fetchAndSaveInflation() {')
                end_idx = code.find('return records;\n}\n\n//')
                if start_idx != -1 and end_idx != -1:
                    code = code[:start_idx] + inf_repl + code[end_idx + 18:]
                    
                with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8') as out:
                    out.write(code)
                print("Extracted properly and patched!")
                break
            except Exception as e:
                pass
