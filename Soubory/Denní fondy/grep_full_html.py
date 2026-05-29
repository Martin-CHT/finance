import json
import codecs

found = []
with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'denni-fondy.html' in line and 'view_file' in line:
            try:
                data = json.loads(line)
                if data.get('type') == 'TOOL_RESPONSE':
                    output = data.get('content', '')
                    if '<!DOCTYPE html>' in output:
                        found.append(output)
            except Exception as e:
                pass

if found:
    # Get the latest one
    with codecs.open('restored.html', 'w', encoding='utf-8') as out:
        out.write(found[-1])
    print("Found HTML from view_file! Length:", len(found[-1]))
else:
    print("Not found in view_file.")
