import json
import codecs

found_html = ""

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
        except Exception:
            continue
            
        if data.get('type') == 'TOOL_RESPONSE':
            content = data.get('content', '')
            if 'denni-fondy.html' in content and '<body' in content:
                found_html += content + "\n\n====\n\n"

if found_html:
    with codecs.open('rescued_viewfile.txt', 'w', encoding='utf-8') as out:
        out.write(found_html)
    print("Found! Length:", len(found_html))
else:
    print("NOT FOUND")
