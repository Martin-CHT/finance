import json
import codecs

found_lines = []

with codecs.open(r'C:\Users\marti\.gemini\antigravity\brain\1c5448a7-93d2-4155-8acb-bdabf361d817\.system_generated\logs\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'denni-fondy.html' in line:
            found_lines.append(line)

with codecs.open('all_denni_fondy_mentions.txt', 'w', encoding='utf-8') as out:
    out.write("\n".join(found_lines))
print("Done! Lines:", len(found_lines))
