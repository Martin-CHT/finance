import json
import codecs

found = False
with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'write_to_file' in line and 'denni-fondy.html' in line:
            try:
                data = json.loads(line)
                if data.get('type') == 'PLANNER_RESPONSE':
                    for call in data.get('tool_calls', []):
                        if call['name'] == 'write_to_file' and 'denni-fondy.html' in str(call['args']):
                            with codecs.open('restored_from_write.html', 'w', encoding='utf-8') as out:
                                out.write(call['args']['CodeContent'])
                            print("Found write_to_file!")
                            found = True
            except Exception as e:
                pass

if not found:
    print("Not found.")
