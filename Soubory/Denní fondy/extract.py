import json
import codecs

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'TargetFile' in line and 'gas-denni-fondy.js' in line:
            try:
                data = json.loads(line)
                code = data['tool_calls'][0]['args']['CodeContent']
                with codecs.open('gas-denni-fondy-restored.js', 'w', encoding='utf-8') as out:
                    out.write(code)
                print("Extracted!")
                break
            except Exception as e:
                pass
