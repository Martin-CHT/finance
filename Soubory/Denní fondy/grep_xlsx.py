import json
import codecs

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'function parsePriceXLSX' in line:
            print("Found occurrence!")
            try:
                data = json.loads(line)
                if data.get('type') == 'PLANNER_RESPONSE':
                    calls = data.get('tool_calls', [])
                    for call in calls:
                        if call['name'] in ['write_to_file', 'replace_file_content', 'multi_replace_file_content']:
                            if 'CodeContent' in call['args']:
                                print("CodeContent found, length:", len(call['args']['CodeContent']))
                                with codecs.open('parse_xlsx_found.js', 'w', encoding='utf-8') as out:
                                    out.write(call['args']['CodeContent'])
                            elif 'ReplacementContent' in call['args']:
                                print("ReplacementContent found")
                                with codecs.open('parse_xlsx_found.js', 'w', encoding='utf-8') as out:
                                    out.write(call['args']['ReplacementContent'])
                            elif 'ReplacementChunks' in call['args']:
                                print("ReplacementChunks found")
                                for chunk in call['args']['ReplacementChunks']:
                                    if 'parsePriceXLSX' in chunk['ReplacementContent']:
                                        with codecs.open('parse_xlsx_found.js', 'w', encoding='utf-8') as out:
                                            out.write(chunk['ReplacementContent'])
            except Exception as e:
                print("Error", e)
