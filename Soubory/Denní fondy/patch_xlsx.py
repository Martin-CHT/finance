import codecs

with codecs.open('gas-denni-fondy.js', 'r', encoding='utf-8-sig') as f:
    text = f.read()

fetch_replacement = '''function fetchPriceHistory(productId) {
  var url  = CONSEQ_BASE + '/Conseq/Pricehist.ashx?productid=' + productId + '&culture=cs-CZ';
  var opts = { muteHttpExceptions: true };
  
  var resp = UrlFetchApp.fetch(url, opts);
  var code = resp.getResponseCode();

  if (code !== 200) {
    throw new Error('HTTP ' + code + ' from Conseq pro productId=' + productId);
  }

  // Zjistíme Content-Type
  var contentType = resp.getHeaders()['Content-Type'] || '';
  
  if (contentType.indexOf('application/octet-stream') !== -1 || contentType.indexOf('application/vnd.openxmlformats') !== -1 || contentType.indexOf('application/zip') !== -1) {
      return parsePriceXLSX(resp.getBlob());
  }

  var content = resp.getContentText('UTF-8');
  
  var result = parsePriceCSV(content);
  if (result.length > 0) return result;

  result = parsePriceHTML(content);
  if (result.length > 0) return result;

  return [];
}'''

# Replace fetchPriceHistory
import re
text = re.sub(r'function fetchPriceHistory\(productId\) \{.*?(?=function parsePriceCSV)', fetch_replacement + '\n\n', text, flags=re.DOTALL)

parse_xlsx_code = '''function parsePriceXLSX(blob) {
  var results = [];
  var unzipped = Utilities.unzip(blob);
  var sheetXml = null;
  var sharedStringsXml = null;
  
  for (var i = 0; i < unzipped.length; i++) {
    var name = unzipped[i].getName();
    if (name === 'xl/worksheets/sheet1.xml') {
      sheetXml = unzipped[i].getDataAsString();
    } else if (name === 'xl/sharedStrings.xml') {
      sharedStringsXml = unzipped[i].getDataAsString();
    }
  }
  
  if (!sheetXml) return results;
  
  // Parse shared strings
  var strings = [];
  if (sharedStringsXml) {
    var siRegex = /<t(?:[^>]*)>([\\s\\S]*?)<\\/t>/g;
    var match;
    while ((match = siRegex.exec(sharedStringsXml)) !== null) {
      strings.push(match[1]);
    }
  }
  
  // Parse rows
  var rowRegex = /<row[^>]*>([\\s\\S]*?)<\\/row>/g;
  var rMatch;
  var isFirstRow = true;
  while ((rMatch = rowRegex.exec(sheetXml)) !== null) {
    if (isFirstRow) {
       isFirstRow = false;
       continue;
    }
    var rowContent = rMatch[1];
    
    var cols = [];
    var cellRegex = /<c r="([A-Z]+)\\d+"(?:[^>]*t="([^"]+)")?[^>]*>(?:<v>([\\s\\S]*?)<\\/v>)?<\\/c>/g;
    var cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
       var colLetter = cellMatch[1];
       var tAttr = cellMatch[2];
       var vVal = cellMatch[3];
       if (!vVal) continue;
       
       if (tAttr === 's') {
          vVal = strings[parseInt(vVal, 10)] || vVal;
       }
       cols[colLetter] = vVal;
    }
    
    if (cols['A'] && cols['B']) {
       var dateStr = cols['A'];
       var priceStr = cols['B'];
       
       // In Excel, dates might be serial numbers (e.g. 46094)
       var excelDate = parseFloat(dateStr);
       var finalDateStr = '';
       if (!isNaN(excelDate) && excelDate > 30000) {
          // Convert Excel serial date to YYYY-MM-DD
          var jsDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
          var m = jsDate.getMonth() + 1;
          var d = jsDate.getDate();
          finalDateStr = jsDate.getFullYear() + '-' + pad2(m) + '-' + pad2(d);
       } else {
          finalDateStr = parseConseqDate(dateStr);
       }
       
       if (finalDateStr) {
          var p = parseFloat(priceStr.replace(',', '.'));
          if (!isNaN(p)) {
             results.push({ date: finalDateStr, price: p });
          }
       }
    }
  }
  
  return results.sort(function(a, b) { return a.date.localeCompare(b.date); });
}

'''

text = text.replace('function parsePriceCSV(content) {', parse_xlsx_code + 'function parsePriceCSV(content) {')

with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8-sig') as f:
    f.write(text)

print("Patch applied successfully.")
