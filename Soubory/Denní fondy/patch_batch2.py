import codecs
import re

with codecs.open('gas-denni-fondy.js', 'r', encoding='utf-8-sig') as f:
    text = f.read()

batch_logic = '''  var priceSheet = getOrCreatePriceSheet();
  var data = priceSheet.getDataRange().getValues();
  var headers = data[0].map(function(h){return String(h).trim();});
  var fundColIdx = headers.indexOf(fond.id);
  if (fundColIdx === -1) {
     fundColIdx = headers.length;
     headers.push(fond.id);
     data[0] = headers;
  }
  
  var existingRows = {};
  for (var i = 1; i < data.length; i++) {
      var dStr = String(data[i][0]);
      if (dStr.indexOf('GMT') !== -1 || typeof data[i][0] === 'object') {
         try {
           var m = data[i][0].getMonth() + 1;
           var d = data[i][0].getDate();
           dStr = data[i][0].getFullYear() + '-' + pad2(m) + '-' + pad2(d);
           data[i][0] = dStr;
         } catch(e) {}
      } else {
         dStr = dStr.substring(0, 10);
         data[i][0] = dStr;
      }
      existingRows[dStr] = i;
  }
  
  var saved = 0;
  for (var j = 0; j < filtered.length; j++) {
      var rec = filtered[j];
      var czk = toCZK(rec.price, rec.currency, fxRates);
      if (existingRows[rec.date] !== undefined) {
          var r = existingRows[rec.date];
          while(data[r].length <= fundColIdx) data[r].push('');
          data[r][fundColIdx] = czk;
      } else {
          var newRow = [rec.date];
          while(newRow.length < headers.length) newRow.push('');
          newRow[fundColIdx] = czk;
          data.push(newRow);
          existingRows[rec.date] = data.length - 1;
      }
      saved++;
  }
  
  var headerRow = data[0];
  var dataRows = data.slice(1);
  dataRows.sort(function(a, b) {
      return String(b[0]).localeCompare(String(a[0]));
  });
  data = [headerRow].concat(dataRows);
  
  priceSheet.clearContents();
  priceSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
'''

pattern = r'var priceSheet = getOrCreatePriceSheet\(\);.*?saved\+\+;\s*\}'
if re.search(pattern, text, re.DOTALL):
    text = re.sub(pattern, batch_logic, text, flags=re.DOTALL)
    with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8-sig') as f:
        f.write(text)
    print("Batch logic patched successfully.")
else:
    print("Could not find pattern.")
