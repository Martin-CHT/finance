import urllib.request
import urllib.parse

url = 'https://www.conseq.cz/fund/getpricehistory'
data = urllib.parse.urlencode({
    'culture': 'cs-CZ', 
    'productId': '10079',
    'dateFrom': '01.01.2023',
    'dateTo': '27.05.2026'
}).encode('utf-8')

req = urllib.request.Request(url, data=data)
req.add_header('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
req.add_header('User-Agent', 'Mozilla/5.0')
req.add_header('X-Requested-With', 'XMLHttpRequest')

try:
    with urllib.request.urlopen(req) as response:
        print(response.getcode())
        content = response.read()
        print(len(content))
except Exception as e:
    print(e)
