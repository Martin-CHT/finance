import json
import codecs

found_html = ""

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
        except Exception:
            continue
            
        # Check PLANNER_RESPONSE
        if data.get('type') == 'PLANNER_RESPONSE':
            for call in data.get('tool_calls', []):
                if call['name'] in ['write_to_file', 'replace_file_content', 'multi_replace_file_content']:
                    # if the content has "backfillModal" we assume it's the right file!
                    content = call['args'].get('CodeContent', '') or call['args'].get('ReplacementContent', '')
                    if 'id="backfillModal"' in content and '<body' in content:
                        found_html = content
        
        # Check TOOL_RESPONSE (e.g. from view_file)
        if data.get('type') == 'TOOL_RESPONSE':
            content = data.get('content', '')
            if 'id="backfillModal"' in content and '<body' in content:
                found_html = content

if found_html:
    with codecs.open('rescued_denni_fondy.html', 'w', encoding='utf-8') as out:
        out.write(found_html)
    print("RESCUED! Length:", len(found_html))
else:
    print("STILL NOT FOUND")
