# Deploy di main con Jenkins

Il job `Synapse-main` carica il Jenkinsfile da `https://github.com/elfo399/Synapse.git`, branch `*/main`. Un webhook GitHub avvisa Jenkins a ogni push: il job verifica se main contiene nuovi commit e avvia subito la build, senza attendere un controllo periodico. Una commit soltanto locale non genera eventi. **Build Now / Esegui adesso** consente l’avvio manuale. Non servono credenziali GitHub per leggere questo repository pubblico.

Il webhook del repository invia soltanto gli eventi `push` a `https://jenkins.elfo3.dev/github-webhook/`, in JSON e con verifica TLS attiva. Jenkins verifica la firma HMAC SHA-256 con la credenziale segreta `synapse-github-webhook`; il segreto non è nel repository. La pipeline dichiara `githubPush()` e non ha più una pianificazione `pollSCM`. Per diagnosticare un mancato avvio, controllare **Settings → Webhooks → Recent deliveries** su GitHub e il log del trigger GitHub del job. Un evento su un altro branch non distribuisce quel branch: il job rimane vincolato a main.

La pipeline registra il commit e usa una chiave SSH dedicata per richiamare lo script di deploy sul Raspberry. La chiave è limitata dal server al comando `deploy <commit>`: Jenkins non riceve il socket Docker né una shell SSH generica. L’identità del server è verificata con una chiave host salvata nelle credenziali Jenkins.

Lo script installato in `/home/elfo/services/synapse/deploy.sh` proviene da `scripts/deploy-jenkins.sh`. Verifica che il commit appartenga a main, crea una directory di release, compila l’immagine ARM64 sul Raspberry e, nelle installazioni successive, salva un backup coordinato di database e allegati prima di applicare le migrazioni e aggiornare i container. La build riesce solo quando il servizio risulta healthy.

## Persistenza

- Configurazione privata: `/home/elfo/services/synapse/.env`, fuori da Git e dalle release.
- Volume PostgreSQL: `synapse-postgres-data`.
- Volume allegati: `synapse-attachments`.
- Backup prima degli aggiornamenti: `/home/elfo/services/synapse/backups`.
- Release e commit installato: `releases/`, `current-release` e `deployed-commit` nella stessa directory.

Il job non esegue `docker compose down -v`, non elimina volumi e non reimposta gli account. La prima installazione è vuota; quelle successive conservano utenti, note e file. Il bootstrap crea l’account iniziale soltanto se assente. Un errore di compilazione lascia in funzione la versione precedente; un errore di migrazione o avvio richiede l’esame del log e del backup, senza ripristini distruttivi automatici.

## Gestione

Le credenziali Jenkins richieste sono `synapse-deploy-ssh` (SSH username/private key) e `synapse-deploy-known-hosts` (file). Il container Jenkins risolve `host.docker.internal` con `host-gateway`. Il deploy usa il progetto Compose `synapse`, distinto dagli altri servizi.

Lo script host e l’override Compose sono configurazione operativa: una modifica di questi file va applicata esplicitamente sul server. Il Jenkinsfile e il codice dell’app, invece, vengono letti da main a ogni build. I backup, le release e le immagini non hanno cancellazione automatica: monitorarne lo spazio e gestire la conservazione.
