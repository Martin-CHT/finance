import codecs
import re

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove Nastavení Button
html = re.sub(r'<a href="\.\./Nastaven[^\.]+\.html"[^>]*>[\s\S]*?Nastavení[\s\S]*?</a>', '', html)

# 2. Add API key input to AI Modal
ai_modal_header = '''<p class="text-[10px] text-slate-500">API klíče   <a href="../Nastavení.html" target="_top"
                            class="text-sky-400 hover:underline">Nastavení</a></p>'''
new_ai_modal_header = '''<div class="mt-2 flex items-center gap-2">
                            <input type="password" id="groqApiKey" placeholder="Vložte Groq API klíč..." class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" onchange="document.cookie='groq_api_key='+this.value+';path=/;max-age=31536000'">
                        </div>'''
html = html.replace(ai_modal_header, new_ai_modal_header)

# 3. Add API key load to openAIModal
html = re.sub(
    r'function openAIModal\(\) \{',
    r'''function openAIModal() {
            const match = document.cookie.match(new RegExp('(^| )groq_api_key=([^;]+)'));
            if (match) document.getElementById('groqApiKey').value = match[2];''',
    html
)

# 4. Modify formatPriceCell to make absolute numbers even smaller and lighter
old_formatPriceCell = r"return `<div class=\"flex flex-col\">[\s\S]*?<span class=\"text-\[9px\] italic text-slate-500 font-mono mt-0\.5\">${valFormatted} CZK</span>[\s\S]*?</div>`;"
new_formatPriceCell = r"return `<div class=\"flex flex-col\">\n                                <span class=\"font-medium\" style=\"color:${color}\">${pctFormatted}%</span>\n                                <span class=\"text-[8px] italic text-slate-600 font-mono mt-0.5 opacity-60\">${valFormatted} CZK</span>\n                            </div>`;"
html = re.sub(old_formatPriceCell, new_formatPriceCell, html)

# 5. Modify Monthly summary background & structure & add Re-scrape button
# The old tr tag for monthly summary:
old_tr = r'<tr class="bg-slate-800/80 hover:bg-slate-700/80 transition-colors cursor-pointer border-y border-slate-700"'
new_tr = r'<tr class="bg-slate-700/80 hover:bg-slate-600/80 transition-colors cursor-pointer border-y border-slate-500"'
html = html.replace(old_tr, new_tr)

# The old label section in summary:
old_label = r'<span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-\[10px\]">\$\{count\} obchodních dnů</span>'
new_label = r'<span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-[10px]">${count} obchodních dnů</span><button onclick="event.stopPropagation(); startSpecificMonthBackfill(\'${ym}\')" class="ml-2 text-sky-400 hover:text-sky-300 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1" title="Znovu načíst tento měsíc z Consequ"><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>'
html = html.replace(old_label, new_label)

# 6. Monthly summary last known value logic
old_summary_logic = r'''const val = lastDayData\.row\[f\.id\];
                    let prevVal = null;
                    // Hledání předchozí nenulové hodnoty pro výpočet procent v hlavičce
                    for \(let i = lastDayData\.originalIndex \+ 1; i < pricesData\.length; i\+\+\) \{
                        if \(pricesData\[i\]\[f\.id\] !== null && pricesData\[i\]\[f\.id\] !== undefined && pricesData\[i\]\[f\.id\] !== \'\'\) \{
                            prevVal = pricesData\[i\]\[f\.id\];
                            break;
                        \}
                    \}'''

new_summary_logic = '''let val = null;
                    let lastValidIdx = lastDayData.originalIndex;
                    // Hledání poslední známé hodnoty V TOMTO měsíci (pokud je první den null)
                    for (let j = 0; j < grouped[ym].length; j++) {
                        const tempVal = grouped[ym][j].row[f.id];
                        if (tempVal !== null && tempVal !== undefined && tempVal !== '') {
                            val = tempVal;
                            lastValidIdx = grouped[ym][j].originalIndex;
                            break;
                        }
                    }

                    let prevVal = null;
                    // Hledání předchozí nenulové hodnoty pro výpočet procent v hlavičce
                    for (let i = lastValidIdx + 1; i < pricesData.length; i++) {
                        if (pricesData[i][f.id] !== null && pricesData[i][f.id] !== undefined && pricesData[i][f.id] !== '') {
                            prevVal = pricesData[i][f.id];
                            break;
                        }
                    }'''
html = re.sub(old_summary_logic, new_summary_logic, html)

# 7. Add Checkboxes to Backfill Modal
old_backfill_modal_content = r'''<div class="mb-4">
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
html = html.replace(old_backfill_modal_content, new_backfill_modal_content)

# Add populate checkboxes to openBackfillModal
html = re.sub(
    r'function openBackfillModal\(\) \{',
    r'''function openBackfillModal() {
            const cbContainer = document.getElementById('backfillFundCheckboxes');
            cbContainer.innerHTML = activeFondy.map(f => `
                <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" id="bf_chk_${f.id}" checked class="rounded bg-slate-900 border-slate-600 text-sky-500">
                    <span style="color:${f.color}">${f.name}</span>
                </label>
            `).join('');
            ''',
    html
)

# Update startBackfill to use checkboxes
old_startBackfill_funds = r'''const fundsToFill = activeFondy\.filter\(f => f\.productId\);'''
new_startBackfill_funds = r'''const fundsToFill = activeFondy.filter(f => f.productId && document.getElementById('bf_chk_' + f.id)?.checked);'''
html = re.sub(old_startBackfill_funds, new_startBackfill_funds, html)

# Stop event propagation on modal buttons to prevent flickering
html = html.replace('onclick="openFundsManager()"', 'onclick="event.stopPropagation(); openFundsManager()"')
html = html.replace('onclick="openSyncModal()"', 'onclick="event.stopPropagation(); openSyncModal()"')
html = html.replace('onclick="openBackfillModal()"', 'onclick="event.stopPropagation(); openBackfillModal()"')
html = html.replace('onclick="openAIModal()"', 'onclick="event.stopPropagation(); openAIModal()"')

with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("denni-fondy.html successfully patched!")
