# Recupero delle conoscenze nell?Assistente AI

## Causa corretta

Il primo refactoring affidava al planner la scelta dello strumento, ma accettava JSON incompleto e trasformava un `itemType` non valido in una query senza filtro. Inoltre i fallimenti di FTS, pgvector e del planner diventavano array vuoti: Qwen non poteva distinguere un recupero fallito da un archivio realmente senza progetti.

## Flusso attuale

1. Qwen produce un piano JSON vincolato, con al massimo tre strumenti.
2. Il backend valida ogni nome e parametro. Per un catalogo, `list_items` richiede obbligatoriamente un `ItemType` valido.
3. `list_items` esegue `Prisma.count` e `Prisma.findMany` usando il solo `userId` autenticato. Il modello riceve `itemType`, `total`, elementi, collegamenti e indicazione di troncamento. I progetti senza contenuto o embedding restano inclusi.
4. Le domande sul contenuto usano FTS e pgvector in parallelo. Se entrambi falliscono, il contesto finale segnala il recupero non disponibile invece di dire che l?archivio ? vuoto.
5. Il progetto attivo viene caricato per ID e `userId` sul server. La cronologia recente passa solo al modello locale della stessa conversazione.
6. Qwen riceve risultati strutturati e genera sempre la risposta finale in streaming. Non esistono risposte hardcoded per cataloghi o domande personali.

Se il piano non ? valido, Qwen riceve un unico invito di correzione. Se anche questo non riesce, nessuno strumento viene eseguito e il modello riceve un contesto esplicito che impedisce di confondere il problema con un archivio vuoto.

## Privacy e osservabilit?

In sviluppo la traccia contiene soltanto nomi degli strumenti, esiti, conteggi e tempi. Non contiene domande, titoli, testi, note, prompt, URL o altri dati privati. SearXNG riceve esclusivamente il messaggio originale dell?utente; il contesto locale non lascia Synapse.
