import json
import codecs

with codecs.open('all_denni_fondy_mentions.txt', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        try:
            data = json.loads(line)
        except Exception:
            continue
            
        content = ""
        if data.get('type') == 'PLANNER_RESPONSE':
            for call in data.get('tool_calls', []):
                content += str(call['args'])
        elif data.get('type') == 'TOOL_RESPONSE':
            content += data.get('content', '')
            
        if '<body' in content:
            print(f"Line {i} has body! Length: {len(content)}")
            with codecs.open(f'body_match_{i}.txt', 'w', encoding='utf-8') as out:
                out.write(content)
