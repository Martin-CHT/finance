import codecs

with codecs.open('gas-denni-fondy.js', 'r', encoding='utf-8-sig') as f:
    code = f.read()

code = code.replace(
    "Logger.log('parsePriceXLSX error: ' + e.message);",
    "Logger.log('parsePriceXLSX error: ' + e.message);\n    throw e;"
)

with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8-sig') as out:
    out.write(code)
print('Done error patch 2')
