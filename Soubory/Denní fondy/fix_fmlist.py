import codecs
import re

with codecs.open('denni-fondy.html', 'r', encoding='utf-8') as f:
    html = f.read()

old_block = re.search(r'function renderFmList\(\).*?lucide\.createIcons\(\);\s*\}', html, re.DOTALL)

if old_block:
    new_block = '''function renderFmList() {
            const list = document.getElementById('fmList');
            list.innerHTML = fmDraft.map((f, i) => `
                <div class="bg-slate-800/50 border border-slate-700 p-3 rounded-lg flex items-start gap-4">
                    <div class="flex-1 space-y-2">
                        <div class="flex gap-2">
                            <input type="text" value="${f.name || ''}" onchange="fmUpdate(${i}, 'name', this.value)" placeholder="Název fondu (např. World Fund)" class="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200">
                            <input type="color" value="${f.color || '#94a3b8'}" onchange="fmUpdate(${i}, 'color', this.value)" class="w-8 h-8 rounded cursor-pointer bg-slate-900 border border-slate-600 p-0">
                        </div>
                        <input type="text" value="${f.slug || ''}" onchange="fmUpdate(${i}, 'slug', this.value)" placeholder="Slug z URL (např. ff-world-fund-hedged-czk)" class="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400 font-mono">
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                            <input type="checkbox" ${f.active ? 'checked' : ''} onchange="fmUpdate(${i}, 'active', this.checked)" class="rounded bg-slate-900 border-slate-600 text-indigo-500 focus:ring-indigo-500">
                            Aktivní
                        </label>
                        <button onclick="fmRemove(${i})" class="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1 transition-colors mt-2" title="Odstranit fond">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Smazat
                        </button>
                    </div>
                </div>
            `).join('');
            lucide.createIcons();
        }'''
    
    html = html[:old_block.start()] + new_block + html[old_block.end():]
    with codecs.open('denni-fondy.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Fixed renderFmList!")
else:
    print("Could not find renderFmList block!")

