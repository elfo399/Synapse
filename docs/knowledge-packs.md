# Knowledge packs

I knowledge pack importano dataset curati nel workspace Synapse usando gli stessi service di dominio dell'applicazione (`createItem` / `updateItem`). Non scrivono SQL direttamente e quindi mantengono tag, parent relation, wikilink, normalizzazione e vincoli del modello.

## Arcadia

Il pack `arcadia` trasforma il repository Unity `elfo399/Arcadia` in una knowledge base tecnica collegata. Lo snapshot iniziale contiene 26 elementi: un `PROJECT` radice, un bookmark al repository, resource di contesto e note dedicate a dungeon, player, save, inventory, quest, dialogue, blacksmith, scene lifecycle, UI, tooling e validation.

Il pack non importa texture, prefab, `.meta`, asset third-party, cache o l'intero codice sorgente. Conserva invece responsabilità, invarianti, flussi, rischi e path sorgente utili per ritrovare rapidamente il contesto.

### Prima esecuzione

Con un solo utente nel database:

```bash
npm run knowledge:arcadia:dry-run
npm run knowledge:arcadia
```

Con più utenti:

```bash
npm run knowledge:arcadia:dry-run -- --email you@example.com
npm run knowledge:arcadia -- --email you@example.com
```

In alternativa puoi impostare `SYNAPSE_IMPORT_USER_EMAIL` nell'ambiente del comando.

### Idempotenza e protezione dei contenuti

Ogni elemento gestito contiene un marker HTML invisibile del tipo:

```text
<!-- synapse-knowledge-pack:arcadia:dungeon-framework -->
```

Alle esecuzioni successive lo script individua gli elementi per marker/slug e li aggiorna, quindi non crea duplicati. Se uno dei titoli canonici è già occupato da un elemento non gestito dal pack, l'import viene annullato prima di scrivere dati.

Questo significa che le note del pack sono **managed content**: modifiche manuali al loro contenuto possono essere sovrascritte dal successivo sync. Per aggiungere conoscenza personale stabile, crea una nota separata e collegala con un wikilink.

### Aggiornare il pack

1. Verifica il nuovo commit di Arcadia.
2. Aggiorna `source.ref`, `source.capturedAt` e `version` in `scripts/knowledge-packs/arcadia.json`.
3. Aggiorna soltanto le note realmente cambiate, privilegiando codice corrente e documentazione recente rispetto all'handoff storico.
4. Esegui il dry-run.
5. Esegui l'import reale.
6. Controlla il progetto `Arcadia` e il grafo in Synapse.

### Modello delle relazioni

Tutti gli elementi Arcadia sono figli del progetto `Arcadia` tramite relazione `PARENT`. I `[[wikilink]]` nei contenuti generano automaticamente relazioni `REFERENCES`, così il knowledge graph mantiene sia la gerarchia del progetto sia le connessioni semantiche tra sistemi.

### Aggiungere un altro knowledge pack

Crea `scripts/knowledge-packs/<nome>.json` con lo stesso schema e usa:

```bash
npx tsx scripts/import-knowledge-pack.ts <nome> --dry-run
npx tsx scripts/import-knowledge-pack.ts <nome>
```

Lo schema viene validato con Zod prima di qualunque scrittura.
