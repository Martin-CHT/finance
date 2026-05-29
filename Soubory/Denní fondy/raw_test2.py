import urllib.request
import re

url = 'https://www.conseq.cz/investice/prehled-fondu/ff-world-fund-hedged-czk'
req = urllib.request.Request(url)
req.add_header('User-Agent', 'Mozilla/5.0')
with urllib.request.urlopen(req) as response:
    html = response.read().decode('utf-8')
    matches = re.findall(r'<a[^>]*href="([^"]+)"[^>]*>.*?Stáhnout.*?</a>', html, re.IGNORECASE | re.DOTALL)
    for m in matches:
        print(m)
        
    matches2 = re.findall(r'<a[^>]*href="([^"]*export[^"]*)"[^>]*>.*?</a>', html, re.IGNORECASE | re.DOTALL)
    for m in matches2:
        print(m)
