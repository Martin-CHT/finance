import json
import codecs

found = []
with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'backfillModal' in line and '<div' in line:
            try:
                data = json.loads(line)
                if data.get('type') == 'TOOL_RESPONSE' or data.get('type') == 'PLANNER_RESPONSE':
                    found.append(line)
            except Exception as e:
                pass

if found:
    with codecs.open('html_matches.txt', 'w', encoding='utf-8') as out:
        out.write("\n".join(found))
    print("Found matches!", len(found))
else:
    print("Not found.")
