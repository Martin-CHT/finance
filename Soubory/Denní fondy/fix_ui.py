import codecs
import re

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

old_save_logic = """            try {
                const payload = { action: 'saveConfig', fondy: fmDraft };
                const resp = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                const json = await resp.json();
                
                status.textContent = '✓ Uloženo do cloudu';
                status.classList.remove('hidden');
                
                // Nyní rovnou spustíme syncConfig, aby se načetla nová productIds!
                status.textContent = '✓ Uloženo, zjišťuji ID z Consequ...';
                await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'syncConfig', fondy: fmDraft })
                });

                setTimeout(() => {
                    closeModal('fundsManagerModal');
                    loadAllData(); // Reload celý dashboard
                }, 1500);

            } catch (err) {"""

new_save_logic = """            try {
                status.textContent = '🔄 Ukládám a synchronizuji ID z Consequ...';
                status.classList.remove('hidden');
                
                const payload = { action: 'syncConfig', fondy: fmDraft };
                const resp = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                const json = await resp.json();
                
                status.textContent = '✓ Úspěšně uloženo do cloudu a synchronizováno';

                setTimeout(() => {
                    closeModal('fundsManagerModal');
                    loadAllData(); // Reload celý dashboard
                }, 1500);

            } catch (err) {"""

if old_save_logic in html:
    html = html.replace(old_save_logic, new_save_logic)
    with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("UI logic fixed!")
else:
    print("Could not find old save logic in HTML.")

