import json
import codecs

with codecs.open('html_matches.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    data = json.loads(line)
    if data.get('type') == 'PLANNER_RESPONSE':
        calls = data.get('tool_calls', [])
        for call in calls:
            if call['name'] in ['write_to_file', 'replace_file_content', 'multi_replace_file_content']:
                if 'CodeContent' in call['args']:
                    print(f"Match {i} has CodeContent of length {len(call['args']['CodeContent'])}")
                    with codecs.open(f'restored_{i}.html', 'w', encoding='utf-8') as out:
                        out.write(call['args']['CodeContent'])
                elif 'ReplacementContent' in call['args']:
                    print(f"Match {i} has ReplacementContent of length {len(call['args']['ReplacementContent'])}")
                    
    elif data.get('type') == 'TOOL_RESPONSE':
        output = data.get('content', '')
        print(f"Match {i} is TOOL_RESPONSE of length {len(output)}")
