$html = Get-Content denni-fondy.html -Raw -Encoding UTF8

$html = $html -replace '<p class="text-\[10px\] text-slate-500">API klíèe[^<]*</p>', '<div class="mt-2 flex items-center gap-2"><input type="password" id="groqApiKey" placeholder="Vložte Groq API klíè..." class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" onchange="document.cookie=''groq_api_key=''+this.value+'';path=/;max-age=31536000''"></div>'

if (-not ($html -match 'document\.cookie\.match')) {
    $html = $html -replace 'function openAIModal\(\) \{', "function openAIModal() {`n            const match = document.cookie.match(new RegExp('(^| )groq_api_key=([^;]+)'));`n            if (match) document.getElementById('groqApiKey').value = match[2];"
}

$old_fmt = [regex]::Escape('            return `<div class="price-cell flex flex-col items-end">
                <div>${diffHtml}</div>
                <div class="text-[9px] text-slate-500 italic mt-0.5 font-mono">${priceStr} CZK</div>
            </div>`;')
$new_fmt = '            return `<div class="price-cell flex flex-col items-end">
                <div>${diffHtml}</div>
                <div class="text-[8px] text-slate-600 italic mt-0.5 font-mono opacity-60">${priceStr} CZK</div>
            </div>`;'
$html = $html -replace $old_fmt, $new_fmt

$html = $html -replace 'class="bg-slate-800/80 hover:bg-slate-700/80 transition-colors cursor-pointer border-y border-slate-700"', 'class="bg-slate-700/80 hover:bg-slate-600/80 transition-colors cursor-pointer border-y border-slate-500"'

$old_span = [regex]::Escape('<span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-[10px]">${count} obchodních dnù</span>')
$new_span = '<span class="font-normal text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded ml-2 text-[10px]">${count} obchodních dnù</span><button onclick="event.stopPropagation(); startSpecificMonthBackfill(''${ym}'')" class="ml-2 text-sky-400 hover:text-sky-300 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1" title="Znovu naèíst tento mìsíc z Consequ"><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>'
$html = $html -replace $old_span, $new_span

$old_chk = [regex]::Escape('<div class="mb-4">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">Kolik let historie naèíst?</label>
                  <select id="backfillYears"
                      class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
                      <option value="1">Poslední 1 rok</option>
                      <option value="2">Poslední 2 roky</option>
                      <option value="3">Poslední 3 roky</option>
                      <option value="5">Posledních 5 let</option>
                      <option value="10">Posledních 10 let</option>
                  </select>
              </div>')
$new_chk = '<div class="mb-4">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">Kolik let historie naèíst?</label>
                  <select id="backfillYears" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500">
                      <option value="1">Poslední 1 rok</option><option value="2">Poslední 2 roky</option><option value="3">Poslední 3 roky</option><option value="5">Posledních 5 let</option><option value="10">Posledních 10 let</option>
                  </select>
              </div>
              <div class="mb-4">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">Vyberte fondy pro naètení:</label>
                  <div id="backfillFundCheckboxes" class="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-slate-800 rounded border border-slate-700"></div>
              </div>'
$html = $html -replace $old_chk, $new_chk

Set-Content denni-fondy.html -Value $html -Encoding UTF8
