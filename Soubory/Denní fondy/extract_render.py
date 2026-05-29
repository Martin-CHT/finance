import codecs
import re

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

m = re.search(r'(function renderTable\(\) \{.*?\n        \})', html, re.DOTALL)
if m:
    with codecs.open('render_table.js', 'w', encoding='utf-8') as f:
        f.write(m.group(1))
    print("Extracted!")
