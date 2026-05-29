import codecs

with codecs.open('gas-denni-fondy.js', 'r', encoding='utf-8-sig') as f:
    code = f.read()

code = code.replace(
    "if (resp.getResponseCode() !== 200) return [];",
    "if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' from Conseq');"
)

code = code.replace(
    "if (!history.length) return { ok: false, error: 'Žádná data z Conseq pro productId=' + fond.productId };",
    "if (!history || !history.length) return { ok: false, error: 'Žádná data z Conseq pro productId=' + fond.productId };"
)

# And in backfillOneFund we need to catch it
code = code.replace(
    "var history = fetchPriceHistory(fond.productId);",
    "try { var history = fetchPriceHistory(fond.productId); } catch(e) { return { ok: false, error: e.message }; }"
)

with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8-sig') as out:
    out.write(code)
print('Done error patch')
