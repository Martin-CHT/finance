import codecs

with codecs.open('c:\\Users\\marti\\.gemini\\antigravity\\brain\\1c5448a7-93d2-4155-8acb-bdabf361d817\\task.md', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('[ ] 2', '[x] 2')
text = text.replace('[ ] 3', '[x] 3')
text = text.replace('[ ] 4', '[x] 4')

with codecs.open('c:\\Users\\marti\\.gemini\\antigravity\\brain\\1c5448a7-93d2-4155-8acb-bdabf361d817\\task.md', 'w', encoding='utf-8') as f:
    f.write(text)
