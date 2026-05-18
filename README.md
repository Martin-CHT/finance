# Finance Terminal

Osobní finanční nástroje jako čistě client-side aplikace — bez backendu, data v `localStorage` / cookies, AI a synchronizace s Google Sheets jsou volitelné a konfigurují se z jednoho místa.

Vše je publikované přes GitHub Pages, takže každý modul je jen otevřená HTML stránka v prohlížeči.

---

## Rozcestník

Hlavní vstupní bod aplikace:

| Aplikace | Spustit |
|---|---|
| **Finanční centrum** — jednotný dashboard se všemi moduly | [▶ Spustit](https://martin-cht.github.io/Finance/Index.html) |
| **Nastavení** — AI klíče, Google Sheets, pořadí modulů, téma | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/Nastaven%C3%AD.html) |

> Z dashboardu lze otevřít jakýkoli modul jedním kliknutím v záložkách nebo přes dlaždice. Pořadí dlaždic a záložek si můžete přeskupit ručně (drag & drop) — uložené pořadí přežije obnovu stránky.

---

## Moduly

| Modul | Popis | Spustit |
|---|---|---|
| Příjmy & Výdaje | Sledování transakcí, kategorizace, AI rychlovstup, grafy cashflow, CZK/EUR | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/P%C5%99%C3%ADjmy-V%C3%BDdaje.html) |
| Spoření & Cíle | Spořicí cíle s hierarchií složek, drag-and-drop, AI coaching | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/Spo%C5%99en%C3%AD.html) |
| Investice & Penze | Plánování penze, složený úrok, prognóza kapitálu, AI poradce | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/Investice-penze.html) |
| Půjčky & Splátky | Portfolio půjček, amortizační plány, mimořádné splátky | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/P%C5%AFj%C4%8Dky.html) |
| Fondy Conseq | Vývoj fondů Conseq vs. inflace ČNB, AI analýza | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/Fondy.html) |
| Majetek & Odpisy | Evidence elektroniky, lineární odpisy, hlídání záruční doby, statistiky | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/Majetek-odpisy.html) |
| Nastavení | Sjednocená konfigurace celého Terminalu | [▶ Spustit](https://martin-cht.github.io/Finance/Soubory/Nastaven%C3%AD.html) |

> Pokud GitHub Pages neumí dekódovat diakritiku v URL, lze do prohlížeče napsat URL i s přímo zapsanou diakritikou — Pages diakritiku akceptují.

---

## Struktura repozitáře

```
Finance/
├── README.md
├── Index.html                       ← dashboard + iframe rozcestník
├── Conseq.fondy.user.js             ← Tampermonkey skript (původní)
├── Conseq.fondy.github.user.js      ← Tampermonkey skript (GitHub)
└── Soubory/
    ├── Fondy.html
    ├── Investice-penze.html
    ├── Příjmy-Výdaje.html
    ├── Půjčky.html
    ├── Spoření.html
    ├── Majetek-odpisy.html
    ├── Nastavení.html               ← sjednocená konfigurace
    └── finance-common.js            ← společný most (load do každého modulu)
```

---

## Sjednocené nastavení

Všechny moduly sdílí jednu konfiguraci, kterou spravujete v `Soubory/Nastavení.html`:

- **AI API klíče** (Groq, Gemini) — ukládají se do cookies (1 rok) i localStorage.
- **Google Sheets** — jeden společný Apps Script webhook pro všechny moduly. Doplňkové pole pro Sheet ID a sdílený token (volitelná ochrana webhooku).
- **Pořadí modulů** — drag & drop, lze přeskupit i přímo na dashboardu (Index.html → ikona šipek nahoru/dolů v hlavičce).
- **Téma** (tmavé / světlé) — automaticky se propaguje do všech otevřených modulů.
- **Export / import konfigurace** jako JSON, nebo **záloha přes Google Sheets** (tlačítka „Zálohovat klíče do Sheets" a „Načíst klíče ze Sheets").

Změny v `Nastavení.html` se okamžitě promítnou do všech modulů — společný `finance-common.js` migruje sjednocené hodnoty i do legacy klíčů, které jednotlivé moduly dříve používaly (zpětná kompatibilita).

---

## Zásady

- **No backend.** Vše běží v prohlížeči, data zůstávají u vás.
- **Volitelná AI.** Bez klíče modul funguje, pouze bez AI rychlovstupu a coache.
- **Volitelný cloud.** Google Sheets webhook je jen pro zálohu/přenos mezi zařízeními — nikam jinam data necestují.
- **Open source.** Kompletní zdroj v tomto repozitáři.

<!-- trigger-openai-provider-patch -->
