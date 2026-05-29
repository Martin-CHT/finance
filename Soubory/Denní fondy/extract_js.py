import codecs
import re

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

m = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
if m:
    with codecs.open('temp.js', 'w', encoding='utf-8') as f:
        f.write(m.group(1))
    print("Extracted script.")
