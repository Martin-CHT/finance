import codecs

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

new_js = '''
        async function startSpecificMonthBackfill(ym) {
            if (!confirm(`Opravdu chcete znovu stáhnout data z Consequ pro měsíc ${ym}? Tím se přepíší existující hodnoty v tomto měsíci.`)) return;
            
            const gasUrl = DENNI_FONDY_CONFIG.gasUrl;
            showToast(`Stahuji data pro měsíc ${ym}...`, 'info', 3000);
            
            const fundsToFill = activeFondy.filter(f => f.productId);
            let successCount = 0;
            
            for (const f of fundsToFill) {
                try {
                    const resp = await fetch(`${gasUrl}?action=backfillMonth&fundId=${f.id}&ym=${ym}`);
                    const json = await resp.json();
                    if (json.success) successCount++;
                } catch(e) {
                    console.error("Backfill chybil pro", f.name, e);
                }
            }
            
            showToast(`Obnova měsíce dokončena (${successCount}/${fundsToFill.length}). Načítám nová data...`, 'success', 4000);
            setTimeout(() => {
                loadAllData();
            }, 1000);
        }
'''

if 'startSpecificMonthBackfill' not in html:
    html = html.replace('function startBackfill() {', new_js + '\n        function startBackfill() {')
    with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Added startSpecificMonthBackfill JS.")
else:
    print("Already added.")

