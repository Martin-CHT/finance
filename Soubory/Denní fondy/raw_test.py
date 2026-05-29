import urllib.request

url = 'https://www.conseq.cz/investice/prehled-fondu/ff-world-fund-hedged-czk'
req = urllib.request.Request(url)
req.add_header('User-Agent', 'Mozilla/5.0')
with urllib.request.urlopen(req) as response:
    html = response.read().decode('utf-8')
    import re
    # Find all references to getpricehistory or similar
    matches = re.findall(r'.{0,50}getpricehistory.{0,50}', html, re.IGNORECASE)
    for m in matches:
        print(m)
