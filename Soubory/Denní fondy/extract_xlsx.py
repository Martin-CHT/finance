import codecs
import json

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'parsePriceXLSX' in line and 'CodeContent' in line:
            try:
                data = json.loads(line)
                code_str = data['tool_calls'][0]['args']['CodeContent']
                if code_str.startswith('"'):
                    code = json.loads(code_str)
                else:
                    code = code_str
                print("Found parsePriceXLSX in transcript!")
                with codecs.open('gas-denni-fondy-with-xlsx.js', 'w', encoding='utf-8') as out:
                    out.write(code)
                break
            except Exception as e:
                pass
