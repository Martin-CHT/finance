import codecs
import re

with codecs.open('gas-denni-fondy.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Add action routing for backfillMonth
old_routing = r"case 'backfillFund':"
new_routing = r"case 'backfillMonth':\n        result = backfillOneFundForMonth(params.fundId, params.ym);\n        break;\n      case 'backfillFund':"
js = re.sub(old_routing, new_routing, js)

# Add backfillOneFundForMonth function
new_func = '''
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

// BACKFILL JEDNOHO FONDU (voláno z HTML přes GET ?action=backfillFund)'''

js = js.replace('// BACKFILL JEDNOHO FONDU (volno z HTML pes GET ?action=backfillFund)', new_func)
js = js.replace('// BACKFILL JEDNOHO FONDU (voláno z HTML přes GET ?action=backfillFund)', new_func)

with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8') as f:
    f.write(js)
print("GAS patched with backfillMonth")
