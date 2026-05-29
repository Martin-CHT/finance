import json
import codecs

found = ""
with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'denni-fondy.html' in line:
            try:
                data = json.loads(line)
                if data.get('type') == 'PLANNER_RESPONSE':
                    calls = data.get('tool_calls', [])
                    for call in calls:
                        if call['name'] in ['write_to_file', 'replace_file_content', 'multi_replace_file_content']:
                            if 'CodeContent' in call['args'] and 'denni-fondy.html' in str(call['args']):
                                found = call['args']['CodeContent']
                            if 'ReplacementContent' in call['args'] and 'denni-fondy.html' in str(call['args']):
                                pass # We want the full file
            except Exception as e:
                pass

if found:
    with codecs.open('denni-fondy_backup.html', 'w', encoding='utf-8') as out:
        out.write(found)
    print("Found full HTML backup in transcript!")
else:
    print("No full backup found.")
