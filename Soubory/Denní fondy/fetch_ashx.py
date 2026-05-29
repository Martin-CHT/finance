import urllib.request
url = 'https://www.conseq.cz/Conseq/Pricehist.ashx?productid=10079&culture=cs-CZ'
req = urllib.request.Request(url)
req.add_header('User-Agent', 'Mozilla/5.0')
try:
    with urllib.request.urlopen(req) as response:
        content = response.read()
        print(len(content))
        with open('test.xls', 'wb') as f:
            f.write(content)
except Exception as e:
    print(e)
