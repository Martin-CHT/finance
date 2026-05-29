import json
import codecs

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'function parsePriceXLSX' in line:
            try:
                data = json.loads(line)
                if data.get('type') == 'PLANNER_RESPONSE':
                    calls = data.get('tool_calls', [])
                    for call in calls:
                        if call['name'] == 'multi_replace_file_content':
                            chunks_str = call['args'].get('ReplacementChunks', '[]')
                            if isinstance(chunks_str, str):
                                chunks = json.loads(chunks_str)
                            else:
                                chunks = chunks_str
                            for chunk in chunks:
                                if 'parsePriceXLSX' in chunk.get('ReplacementContent', ''):
                                    with codecs.open('parse_xlsx_found.js', 'w', encoding='utf-8') as out:
                                        out.write(chunk['ReplacementContent'])
                                    print("Wrote parse_xlsx_found.js")
            except Exception as e:
                pass
