import codecs

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Patch openBackfillModal
open_replacement = '''function openBackfillModal() {
            document.getElementById('backfillProgress').innerHTML = '';
            document.getElementById('backfillProgress').classList.add('hidden');
            
            const selEl = document.getElementById('backfillFundSelection');
            if (selEl) {
                const validFunds = activeFondy.filter(f => f.productId);
                if (validFunds.length === 0) {
                    selEl.innerHTML = '<div class="text-rose-400">Nejprve synchronizujte fondy.</div>';
                } else {
                    selEl.innerHTML = validFunds.map(f => 
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 p-1 rounded transition-colors">
                            <input type="checkbox" class="backfill-fund-cb rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-sky-500" value="" checked>
                            <span></span>
                        </label>
                    ).join('');
                }
            }
            
            document.getElementById('backfillSummary').classList.add('hidden');
            document.getElementById('btnBackfillStart').disabled = false;
            document.getElementById('btnBackfillStart').innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> Spustit načítání';
            lucide.createIcons();
            showModal('backfillModal');
        }'''

start_idx = html.find('function openBackfillModal() {')
end_idx = html.find('function openAIModal() {')

if start_idx != -1 and end_idx != -1:
    html = html[:start_idx] + open_replacement + '\n        ' + html[end_idx:]

# Patch startBackfill
start_bf_idx = html.find('const fundsToFill = activeFondy.filter(f => f.productId);')
if start_bf_idx != -1:
    start_bf_repl = '''const selectedIds = Array.from(document.querySelectorAll('.backfill-fund-cb:checked')).map(cb => cb.value);
            const fundsToFill = activeFondy.filter(f => f.productId && selectedIds.includes(f.id));
            
            if (fundsToFill.length === 0) {
                showToast('Vyberte alespoň jeden fond', 'warn');
                return;
            }
            
            document.getElementById('backfillProgress').classList.remove('hidden');'''
    html = html[:start_bf_idx] + start_bf_repl + html[start_bf_idx + len('const fundsToFill = activeFondy.filter(f => f.productId);'):]

with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("HTML patched successfully.")
