import json
import codecs

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'TargetFile' in line and 'gas-denni-fondy.js' in line:
            try:
                data = json.loads(line)
                code_str = data['tool_calls'][0]['args']['CodeContent']
                # The code_str is a JSON string itself
                code = json.loads(code_str)
                with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8') as out:
                    out.write(code)
                print("Extracted properly!")
                break
            except Exception as e:
                print(e)
