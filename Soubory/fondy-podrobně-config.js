/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║             KONFIGURACE DENNÍCH FONDŮ — fondy-config.js              ║
 * ║                                                                      ║
 * ║  TENTO SOUBOR JE JEDINÉ MÍSTO, KDE PŘIDÁVÁTE NEBO UPRAVUJETE FONDY   ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║                                                                      ║
 * ║  JAK PŘIDAT NOVÝ FOND:                                               ║
 * ║  ─────────────────────                                               ║
 * ║  1. Otevřete https://www.conseq.cz/investice/prehled-fondu/          ║
 * ║  2. Najděte fond, který chcete sledovat, a klikněte na něj           ║
 * ║  3. Zkopírujte POSLEDNÍ ČÁST URL adresy, tzv. "slug", např.:         ║
 * ║                                                                      ║
 * ║     URL:  https://www.conseq.cz/investice/prehled-fondu/             ║
 * ║                ff-world-fund-hedged-czk                              ║
 * ║     SLUG: ff-world-fund-hedged-czk                                   ║
 * ║                                                                      ║
 * ║  4. Najděte volný slot (f7 až f10) v poli fondy[] níže               ║
 * ║  5. Nastavte:                                                        ║
 * ║       name:   Zobrazovaný název fondu (libovolný)                    ║
 * ║       slug:   Zkopírovaný slug z URL Conseq                          ║
 * ║       color:  Barva v grafu (hex kód, vyberte unikátní barvu)        ║
 * ║       active: true  ← musí být true, aby se fond sledoval            ║
 * ║  6. Uložte soubor a obnovte stránku denni-fondy.html                 ║
 * ║  7. Klikněte na "Synchronizovat fondy" → systém automaticky          ║
 * ║     zjistí productId z webu Conseq a zahájí stahování kurzů          ║
 * ║                                                                      ║
 * ║  POZNÁMKY:                                                           ║
 * ║  ─────────                                                           ║
 * ║  • productId NECHÁVEJTE na null — systém ho zjistí sám               ║
 * ║  • Fungují pouze fondy z webu www.conseq.cz                          ║
 * ║  • Fondy v jiných měnách jsou automaticky přepočítány na CZK         ║
 * ║    (kurzy ČNB, stahují se denně)                                     ║
 * ║  • Neaktivní sloty (active: false) se ignorují                       ║
 * ║  • Po deaktivaci fondu (active: false) jeho historická data          ║
 * ║    zůstanou v Google Sheetu zachována                                ║
 * ║                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

const DENNI_FONDY_CONFIG = {

    /**
     * URL vašeho Google Apps Script (Web App endpoint).
     *
     * POSTUP NASAZENÍ GAS:
     * 1. Otevřete script.google.com a vytvořte nový projekt
     * 2. Vložte kód z artefaktu "Google Apps Script — Denní fondy"
     * 3. Klikněte Nasadit → Nové nasazení → Webová aplikace
     * 4. Spustit jako: Já | Kdo má přístup: Kdokoli
     * 5. Zkopírujte vygenerovanou URL a vložte ji sem
     */
    gasUrl: "https://script.google.com/macros/s/AKfycbx0K0LnPZ5818zzA74WIU_PsUjkieuuM8G5f4iU_G9V44j7VW00rVWdg7atL_vVR9A7/exec",

    /**
     * Maximální počet dnů historických dat k zobrazení.
     * Doporučeno: 365 (1 rok). Větší hodnoty zpomalí načítání.
     */
    maxDays: 365,

    /**
     * ════════════════════════════════════════════════════════════════
     * SEZNAM FONDŮ (max. 10 slotů: f1 až f10)
     * ════════════════════════════════════════════════════════════════
     *
     * Každý fond má tyto vlastnosti:
     *   id       : Interní identifikátor (NEMĚŇTE po první synchronizaci!)
     *   name     : Zobrazovaný název v tabulce a grafu
     *   slug     : Část URL z webu Conseq (viz návod výše)
     *   color    : Barva linky v grafu (hex kód)
     *   active   : true = sledovat | false = ignorovat
     *   productId: Nechte null — systém zjistí automaticky
     */
    fondy: [
        // ── AKTIVNÍ FONDY ──────────────
        {
            id: 'f3',
            name: 'Nová Evropa A',
            slug: 'conseq-invest-akcie-nove-evropy-a-cs',
            color: '#10b981',
            active: true,
            productId: null
        },
        {
            id: 'f1',
            name: 'World Fund',
            slug: 'ff-world-fund-hedged-czk',
            color: '#f59e0b',
            active: true,
            productId: null   // zjistí se automaticky
        },
        {
            id: 'f5',
            name: 'Vyvážený',
            slug: 'active-invest-vyvazeny',
            color: '#6366f1',
            active: true,
            productId: null
        },
        {
            id: 'f6',
            name: 'Realitní',
            slug: 'conseq-realitni-czk',
            color: '#14b8a6',
            active: true,
            productId: null
        },
        {
            id: 'f4',
            name: 'Dluhopisový A',
            slug: 'conseq-invest-dluhopisovy-fond-a',
            color: '#f97316',
            active: true,
            productId: null
        },
        {
            id: 'f2',
            name: 'Amundi Silver Age',
            slug: 'amundi-cpr-global-silver-age-hedged-czk',
            color: '#a855f7',
            active: true,
            productId: null
        },

        // ── VOLNÉ SLOTY (f7–f10) — odkomentujte a vyplňte dle potřeby ──
        // Příklad přidání dalšího fondu:
        // {
        //     id: 'f7',
        //     name: 'Název fondu',
        //     slug: 'slug-z-url-conseq',
        //     color: '#38bdf8',
        //     active: true,
        //     productId: null
        // },
        { id: 'f7',  name: '', slug: '', color: '#38bdf8', active: false, productId: null },
        { id: 'f8',  name: '', slug: '', color: '#e879f9', active: false, productId: null },
        { id: 'f9',  name: '', slug: '', color: '#4ade80', active: false, productId: null },
        { id: 'f10', name: '', slug: '', color: '#fb923c', active: false, productId: null }
    ]
};
