import codecs

with codecs.open('gas-denni-fondy.js', 'r', encoding='utf-8-sig') as f:
    text = f.read()

# Find the setValues call
old_line = "priceSheet.getRange(1, 1, data.length, data[0].length).setValues(data);"
new_line = '''
  var maxLen = data[0].length;
  for (var k = 1; k < data.length; k++) {
      while(data[k].length < maxLen) data[k].push('');
  }
  priceSheet.getRange(1, 1, data.length, maxLen).setValues(data);
'''
text = text.replace(old_line, new_line)

with codecs.open('gas-denni-fondy.js', 'w', encoding='utf-8-sig') as f:
    f.write(text)
print("Padded rows for setValues.")
