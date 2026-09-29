# Migrazioni del database

Synapse applica le migrazioni automaticamente all'avvio del contenitore web con
`prisma migrate deploy`. Le migrazioni non richiedono mai il reset di un volume
PostgreSQL esistente.

## Correzione della retention del Cestino

Le prime versioni della migration `20260925120000_trash_retention` potevano
raggiungere `TrashOperation` prima della sua creazione in una nuova installazione.
La migration ora non esegue alcuna operazione finché la tabella non esiste; la
migration successiva `20260929090000_complete_trash_retention` crea in modo
idempotente `purgeAfter`, completa le operazioni già presenti e aggiunge gli
indici usati dal worker del Cestino.

Per un'installazione già aggiornata non occorre cancellare dati o volumi. Prima
di aggiornare, eseguire un backup; quindi distribuire l'immagine e lasciare che
`prisma migrate deploy` applichi le migration pendenti. Se una precedente
esecuzione è stata interrotta durante `20260929090000_complete_trash_retention`,
usare una sola volta, dopo aver verificato il backup:

```bash
docker compose run --rm --no-deps --entrypoint sh secondbrain-web -c \
  './node_modules/.bin/prisma migrate resolve --rolled-back 20260929090000_complete_trash_retention && ./node_modules/.bin/prisma migrate deploy'
```

## Manutenzione, backup e ripristino

Backup e ripristino acquisiscono un lease nel database. Il lease sospende i
worker AI e del Cestino, attende la conclusione di una generazione già in corso e
scade automaticamente se il processo di manutenzione termina in modo anomalo.
I backup includono database, allegati, versioni, impostazioni e job persistenti;
non includono immagini Docker, modelli Ollama o configurazioni segrete esterne.

Usare sempre gli script `scripts/backup.sh` e `scripts/restore.sh`: verificano i
checksum prima di un ripristino e producono una copia di sicurezza dello stato
attuale prima della sostituzione.
