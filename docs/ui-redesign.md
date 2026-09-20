# Synapse: riprogettazione dell’interfaccia

La nuova interfaccia mette al centro scrittura, raccolta e collegamenti. La Home apre sul pensiero da annotare; attività, documenti recenti e progetti restano liste secondarie. Non vengono introdotte statistiche o conoscenze fittizie.

## Sistema visivo

I token sono definiti in `src/app/design-tokens.css`: sfondo carbone `#151518`, sidebar `#111114`, superfici `#1b1b20` / `#222228`, testo `#eeeef2`, secondario `#b0b0bc`, attenuato `#9898a4`, accento indaco `#a99cf6`. Verde, rosso e ambra sono riservati ai significati semantici. Raggi di 5, 8 e 12 px, scala di spaziatura basata su 4 px, transizioni di 120/180 ms e ombre solo per sovrapposizioni. Caratteri di sistema, senza richieste a servizi di font esterni.

`globals.css` contiene reset e primitive condivise; gli stili delle funzionalità sono separati e usano i token. I renderer canvas mantengono gli stessi colori in `components/graph/shared.ts`, perché richiedono valori letterali.

## Schermate e componenti

| Ambito        | Cambiamento                                                                                          | File principali                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Navigazione   | Sidebar da 220 px, gruppi silenziosi, ricerca, scorciatoie, preferenze di densità                    | `components/workspace-shell.tsx`, `workspace-shell.css`                                           |
| Primitive     | Titoli senza slogan, righe pulite, dialoghi accessibili, etichette e controlli coerenti              | `components/ui.tsx`, `select.tsx`, `select.css`, `app/globals.css`                                |
| Home          | Annotazione immediata, oggi, recenti e progetti attivi con dati reali                                | `features/dashboard/dashboard.tsx`, `dashboard.css`                                               |
| Raccolte      | Note, Da organizzare, Attività, Progetti, Aree, Risorse, Preferiti, Archivio ed Etichette come liste | `features/items/item-list.tsx`, `collections.css`, `features/tags/tags-page.tsx`                  |
| Documenti     | Titolo adattivo, editor centrale, proprietà secondarie, contesti e collegamenti sotto il testo       | `features/items/item-detail.tsx`, `document.css`, `relations-panel.tsx`, `relations.css`          |
| Scrittura     | Markdown, anteprima e vista affiancata; suggerimenti wiki vicini al cursore anche nelle note lunghe  | `features/items/markdown-editor.tsx`, `markdown-editor.css`                                       |
| Ricerca       | Palette con recenti, risultati, etichette (`#`) e azioni (`>`); frecce e Invio                       | `components/search-dialog.tsx`, `search-dialog.css`                                               |
| Cattura       | Titolo e contenuto immediati, dettagli progressivi, URL obbligatorio per i preferiti                 | `features/items/capture-dialog.tsx`, `capture.css`                                                |
| Accesso e PWA | Login essenziale, visibilità password, marchio astratto a nodi, icone e pagina offline neutrali      | `features/auth/login-form.tsx`, `login.css`, `app/manifest.ts`, `public/icon.svg`, `public/sw.js` |

## Grafo

La vista occupa lo spazio disponibile, senza testata decorativa o ispettore vuoto. L’ispettore compare alla selezione, mostra collegamenti reali e diventa un pannello inferiore su mobile. Ricerca, ambito globale/locale, 2D/3D e schermo intero rimangono compatti; i filtri sono in un popover.

Il grafo locale supporta profondità 1–3. Questa è l’unica estensione al contratto del grafo: `depth` è facoltativo, vale 1 in assenza del parametro, è validato e mantiene isolamento per utente e limiti alla visita del grafo. Non sono necessarie migrazioni del database.

La disposizione usa maggiore repulsione e distanza tra i nodi. Il 3D adatta la camera ai punti proiettati e ricalcola l’inquadratura quando cambia lo spazio dell’ispettore. Le etichette mantengono una dimensione leggibile sullo schermo; nelle zone dense hanno precedenza selezione, hover, vicini e nodi più connessi. Le etichette in collisione vengono ridotte senza eliminare nodi o relazioni. Forme diverse distinguono i tipi anche senza colore. La selezione evidenzia vicini e archi pertinenti, attenuando il contesto.

File principali: `features/graph/graph-view.tsx`, `graph.css`, `components/graph/canvas-3d.tsx`, `canvas.tsx`, `details.tsx`, `shared.ts`, `server/graph.ts`.

## Mobile e accessibilità

- Barra inferiore dedicata a note, raccolta, ricerca e navigazione; menu mobile con focus confinato e chiusura da tastiera.
- Dialoghi e select con nomi accessibili, focus iniziale e ripristino, gestione di Escape annidato, indicatori di focus, collegamento per saltare al contenuto.
- Palette con navigazione da tastiera; editor con suggerimenti wiki nel viewport, senza spostare il focus dal testo; comandi da tastiera ed elenco testuale per il grafo.
- Layout verificato a 1440 e 390 px; preferenza `prefers-reduced-motion` rispettata. Il testo attenuato conserva contrasto almeno 4,5:1 sulle superfici neutre dei token, inclusa quella attiva; ciò non costituisce una certificazione WCAG dell’intera applicazione.

## Regressioni risolte

Ricerca precedentemente disallineata, select nativi incoerenti, focus dei dialoghi annidati, contatore delle liste non stilizzato, overflow dei dettagli su mobile, suggerimenti wiki fuori schermo, etichette del grafo troppo piccole o sovrapposte, menu nascosti dietro il grafo espanso. Corretto anche l’autogrow del titolo che conservava un’altezza transitoria passando da desktop a mobile. Ripuliti i marcatori PostgreSQL che comparivano negli snippet di ricerca.

La suite browser usa una sessione per worker e dati propri per evitare di saturare il limite reale di accesso durante molti test consecutivi. Il limite di autenticazione dell’applicazione rimane attivo.

## Verifiche e immagini

Il registro delle esecuzioni effettive è in [verification.md](verification.md). Le immagini di lavoro sono in `.tools/redesign/`; quelle della versione Docker finale in `.tools/redesign-final/`. Queste directory locali sono escluse da Git, come gli altri strumenti temporanei.

Sono comprese Home, Inbox, collezioni, documenti in scrittura e lettura, progetto, palette, cattura, login, grafo globale/selezionato/locale/2D, varianti mobile e stati loading/empty/error. I test non sostituiscono una prova su un telefono fisico o sul Raspberry Pi.

Non è stata aggiunta una minimappa: i renderer utilizzati non ne espongono una nativa. Non esisteva un tema chiaro da mantenere. Su grafi molto densi alcune etichette rimangono intenzionalmente nascoste finché si ingrandisce, si passa sul nodo o si restringe il grafo locale; l’ispettore e l’elenco testuale restano disponibili.
