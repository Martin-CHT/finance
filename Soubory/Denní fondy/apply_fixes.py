import codecs

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. API key in AI modal
old_ai_header = '<p class="text-[10px] text-slate-500">API klíče   </p>'
new_ai_header = '''<div class="mt-2 flex items-center gap-2">
                            <input type="password" id="groqApiKey" placeholder="Vložte Groq API klíč..." class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" onchange="document.cookie='groq_api_key='+this.value+';path=/;max-age=31536000'">
                        </div>'''
# In case it has a trailing space or something, just replace a robust substring:
import re
html = re.sub(r'<p class="text-\[10px\] text-slate-500">API kl[í\xef\xbf\xbd]če\s*</p>', new_ai_header, html)

# 2. openAIModal logic
if "groqApiKey" in new_ai_header and "document.cookie.match" not in html:
    html = html.replace("function openAIModal() {", '''function openAIModal() {
            const match = document.cookie.match(new RegExp('(^| )groq_api_key=([^;]+)'));
            if (match) document.getElementById('groqApiKey').value = match[2];''')

# 3. formatPriceCell
old_format = '''            return `<div class="price-cell flex flex-col items-end">
                <div>${diffHtml}</div>
                <div class="text-[9px] text-slate-500 italic mt-0.5 font-mono">${priceStr} CZK</div>
            </div>`;'''
new_format = '''            return `<div class="price-cell flex flex-col items-end">
                <div>${diffHtml}</div>
                <div class="text-[8px] text-slate-600 italic mt-0.5 font-mono opacity-60">${priceStr} CZK</div>
            </div>`;'''
html = html.replace(old_format, new_format)

# 4. Remove Nastavení Button (this requires finding the button in index.html, not denni-fondy.html)
# Wait, let's fix the row background in renderTable
old_tr = '''<tr class="bg-slate-800/80 hover:bg-slate-700/80 transition-colors cursor-pointer border-y border-slate-700"'''
new_tr = '''<tr class="bg-slate-700/80 hover:bg-slate-600/80 transition-colors cursor-pointer border-y border-slate-500"'''
html = html.replace(old_tr, new_tr)

# 5. Add re-scrape button
old_span = '''<span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-[10px]">${count} obchodních dnů</span>'''
new_span = '''<span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-[10px]">${count} obchodních dnů</span><button onclick="event.stopPropagation(); startSpecificMonthBackfill('${ym}')" class="ml-2 text-sky-400 hover:text-sky-300 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1" title="Znovu načíst tento měsíc z Consequ"><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>'''
# Try with utf-8 chars, but fall back to dot matching for corrupted files
html = re.sub(r'<span class="font-normal text-slate-400 bg-slate-900 px-1\.5 py-0\.5 rounded ml-2 text-\[10px\]">\$\{count\} obchodn.ch dn.</span>', new_span, html)

# 6. Backfill modal checkboxes
old_backfill_html = '''<div class="mb-4">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">Kolik let historie načíst?</label>
                  <select id="backfillYears"
                      class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
                      <option value="1">Poslední 1 rok</option>
                      <option value="2">Poslední 2 roky</option>
                      <option value="3">Poslední 3 roky</option>
                      <option value="5">Posledních 5 let</option>
                      <option value="10">Posledních 10 let</option>
                  </select>
              </div>'''
# Due to spaces, let's just use a more forgiving regex
html = re.sub(
    r'<div class="mb-4">\s*<label class="block text-xs font-medium text-slate-300 mb-1\.5">Kolik let historie na.íst\?</label>[\s\S]*?</select>\s*</div>',
    '''<div class="mb-4">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">Kolik let historie načíst?</label>
                  <select id="backfillYears" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
                      <option value="1">Poslední 1 rok</option><option value="2">Poslední 2 roky</option><option value="3">Poslední 3 roky</option><option value="5">Posledních 5 let</option><option value="10">Posledních 10 let</option>
                  </select>
              </div>
              <div class="mb-4">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">Vyberte fondy pro načtení:</label>
                  <div id="backfillFundCheckboxes" class="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-slate-800 rounded border border-slate-700"></div>
              </div>''', html)

with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Changes written to denni-fondy.html")
