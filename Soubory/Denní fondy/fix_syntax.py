import codecs

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace the stray async
html = html.replace('async \n        async function startSpecificMonthBackfill', 'async function startSpecificMonthBackfill')
html = html.replace('async \r\n        async function startSpecificMonthBackfill', 'async function startSpecificMonthBackfill')

with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
    f.write(html)
