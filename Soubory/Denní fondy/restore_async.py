import codecs

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('\n        function startBackfill() {', '\n        async function startBackfill() {')

with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
    f.write(html)
