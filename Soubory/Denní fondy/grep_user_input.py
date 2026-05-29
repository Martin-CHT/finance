import json
import codecs

found = []
with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if '<!DOCTYPE html>' in line:
            try:
                data = json.loads(line)
                if data.get('type') == 'USER_INPUT':
                    found.append(data.get('content', ''))
            except Exception as e:
                pass

if found:
    with codecs.open('restored.html', 'w', encoding='utf-8') as out:
        out.write(found[-1])
    print("Found HTML from USER_INPUT! Length:", len(found[-1]))
else:
    print("Not found in USER_INPUT.")
