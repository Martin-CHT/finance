import codecs
import re

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove the "Nastavení" anchor in AI modal (if it exists)
html = re.sub(r'<p[^>]*>API kl[í\xed]če\s*<a href="\.\./Nastaven[^\.]*\.html"[^>]*>Nastaven[í\xed]</a></p>', 
              '''<div class="mt-2 flex items-center gap-2">
                    <input type="password" id="groqApiKey" placeholder="Vložte Groq API klíč..." class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" onchange="document.cookie='groq_api_key='+this.value+';path=/;max-age=31536000'">
                 </div>''', 
              html)

# 2. Open AI Modal modification
if 'groqApiKey' in html and 'document.cookie.match' not in html:
    html = re.sub(
        r'function openAIModal\(\) \{',
        r'''function openAIModal() {
            const match = document.cookie.match(new RegExp('(^| )groq_api_key=([^;]+)'));
            if (match) document.getElementById('groqApiKey').value = match[2];''',
        html
    )

# 3. formatPriceCell format
old_formatPriceCell = r"return `<div class=\"flex flex-col\">[\s\S]*?<span class=\"text-\[9px\] italic text-slate-500 font-mono mt-0\.5\">\$\{valFormatted\} CZK</span>[\s\S]*?</div>`;"
new_formatPriceCell = r"return `<div class=\"flex flex-col\">\n                                <span class=\"font-medium\" style=\"color:${color}\">${pctFormatted}%</span>\n                                <span class=\"text-[8px] italic text-slate-600 font-mono mt-0.5 opacity-60\">${valFormatted} CZK</span>\n                            </div>`;"
html = re.sub(old_formatPriceCell, new_formatPriceCell, html)

# 4. Tr highlight and re-scrape button
# The row highlight logic:
html = re.sub(r'<tr class="bg-slate-800/80 hover:bg-slate-700/80 transition-colors cursor-pointer border-y border-slate-700"',
              r'<tr class="bg-slate-700/80 hover:bg-slate-600/80 transition-colors cursor-pointer border-y border-slate-500"',
              html)

# The Re-scrape button
html = re.sub(r'<span class="font-normal text-slate-400 bg-slate-900 px-1\.5 py-0\.5 rounded ml-2 text-\[10px\]">\$\{count\} obchodn[í\xed]ch dn[ů\xf9]</span>',
              r'<span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-[10px]">${count} obchodních dnů</span><button onclick="event.stopPropagation(); startSpecificMonthBackfill(\'${ym}\')" class="ml-2 text-sky-400 hover:text-sky-300 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1" title="Znovu načíst tento měsíc z Consequ"><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>',
              html)

# 5. Summary logic
old_summary_logic = r'''const val = lastDayData\.row\[f\.id\];\s*let prevVal = null;\s*// Hled[á\xe1]n[í\xed] p[ř\xf8]edchoz[í\xed] nenulov[é\xe9] hodnoty pro v[ý\xfd]po[č\xe8]et procent v hlavi[č\xe8]ce\s*for \(let i = lastDayData\.originalIndex \+ 1; i < pricesData\.length; i\+\+\) \{[\s\S]*?\}'''
new_summary_logic = '''let val = null;
                    let lastValidIdx = lastDayData.originalIndex;
                    for (let j = 0; j < grouped[ym].length; j++) {
                        const tempVal = grouped[ym][j].row[f.id];
                        if (tempVal !== null && tempVal !== undefined && tempVal !== '') {
                            val = tempVal;
                            lastValidIdx = grouped[ym][j].originalIndex;
                            break;
                        }
                    }
                    let prevVal = null;
                    for (let i = lastValidIdx + 1; i < pricesData.length; i++) {
                        if (pricesData[i][f.id] !== null && pricesData[i][f.id] !== undefined && pricesData[i][f.id] !== '') {
                            prevVal = pricesData[i][f.id];
                            break;
                        }
                    }'''
html = re.sub(old_summary_logic, new_summary_logic, html)

# 6. Checkboxes in backfill modal
old_backfill_modal_content = r'''<div class="mb-4">\s*<label class="block text-xs font-medium text-slate-300 mb-1\.5">Kolik let historie na[č\xe8][í\xed]st\?</label>[\s\S]*?</select>\s*</div>'''
new_backfill_modal_content = '''<div class="mb-4">
                    <label class="block text-xs font-medium text-slate-300 mb-1.5">Kolik let historie načíst?</label>
                    <select id="backfillYears"
                        class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
                        <option value="1">Poslední 1 rok</option>
                        <option value="2">Poslední 2 roky</option>
                        <option value="3">Poslední 3 roky</option>
                        <option value="5">Posledních 5 let</option>
                        <option value="10">Posledních 10 let</option>
                    </select>
                </div>
                <div class="mb-4">
                    <label class="block text-xs font-medium text-slate-300 mb-1.5">Vyberte fondy pro načtení:</label>
                    <div id="backfillFundCheckboxes" class="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-slate-800 rounded border border-slate-700">
                    </div>
                </div>'''
html = re.sub(old_backfill_modal_content, new_backfill_modal_content, html)

# 7. Add Checkboxes logic to openBackfillModal
if 'cbContainer' not in html:
    html = re.sub(
        r'function openBackfillModal\(\) \{',
        r'''function openBackfillModal() {
            const cbContainer = document.getElementById('backfillFundCheckboxes');
            if (cbContainer) {
                cbContainer.innerHTML = activeFondy.map(f => `
                    <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input type="checkbox" id="bf_chk_${f.id}" checked class="rounded bg-slate-900 border-slate-600 text-sky-500">
                        <span style="color:${f.color}">${f.name}</span>
                    </label>
                `).join('');
            }''',
        html
    )

with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("done")
