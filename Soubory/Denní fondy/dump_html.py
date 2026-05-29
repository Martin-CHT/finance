import json
import codecs

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if '<body' in line and '<table' in line and 'backfillModal' in line:
            print(f"Found line {i} with possible HTML!")
            with codecs.open(f'dump_{i}.txt', 'w', encoding='utf-8') as out:
                out.write(line)
