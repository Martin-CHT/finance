import codecs
with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\gas-denni-fondy.js', 'r', encoding='utf-8') as f:
    text = f.read()

with codecs.open('gas-denni-fondy-utf8.js', 'w', encoding='utf-8-sig') as f:
    f.write(text)
print("Done")
