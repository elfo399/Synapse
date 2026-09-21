# Cattura universale e allegati

La cattura è disponibile nella Home, nel menu Nuovo, con il tasto N e nella navigazione mobile. Testo e memo diventano note; la modalità File propone Risorsa, mentre un URL completo viene riconosciuto come Preferito. Il tipo resta modificabile nei dettagli. La destinazione predefinita è Da organizzare; la creazione contestuale mantiene la destinazione scelta, e Nuova attività nel dettaglio di una raccolta assegna automaticamente il genitore.

Il titolo è facoltativo: prima riga significativa del testo, dominio/percorso del link, nome del file o data e ora del memo vocale. I titoli derivati duplicati ricevono un suffisso numerico. Non vengono scaricati metadati dai siti esterni e non sono presenti AI, OCR o trascrizione.

## Dettaglio e URL

Contenuto, collegamenti in uscita/in entrata, attività e allegati sono sezioni navigabili. La colonna laterale contiene dettagli, contesto e azioni; sul telefono i dettagli sono comprimibili dopo gli allegati. I breadcrumb usano una relazione PARENT reale; ulteriori genitori restano nel contesto.

`getItemHref` centralizza gli indirizzi `/items/titolo--ID`. L’ID completo mantiene l’identità, anche con titoli uguali tra utenti. Gli indirizzi precedenti e gli slug non aggiornati ricevono un redirect temporaneo alla forma corrente. API, relazioni e grafo continuano a usare gli ID.

## Persistenza e autorizzazione

La migrazione `20260921020000_attachments` introduce Attachment e AttachmentDeletion. PostgreSQL conserva proprietario, elemento, nome originale ripulito, MIME, dimensione, SHA-256, durata opzionale e data. Il vincolo composto impedisce di associare un allegato all’elemento di un altro utente.

`StorageProvider` separa il servizio applicativo dal filesystem. `LocalFilesystemStorage` scrive in `ATTACHMENT_STORAGE_PATH/objects`, usando chiavi casuali esadecimali, creazione esclusiva e permessi privati. La directory non è sotto public. Download, anteprime e richieste Range passano da `/api/attachments/:id`, che verifica sessione e proprietario prima di leggere i byte. Le risposte sono private/no-store, nosniff e same-origin; testo e Markdown vengono scaricati, non eseguiti. Il Markdown visualizza soltanto immagini provenienti dall’endpoint privato, senza ottimizzatore pubblico.

I caricamenti verificano origine, limite della richiesta, numero dei file, firma del formato e coerenza MIME. SVG, HTML, file vuoti e formati non supportati sono rifiutati. I nomi originali non vengono mai usati come percorsi. La validazione delle firme non è una scansione antivirus né una decodifica completa del formato.

Le scritture dei file precedono la transazione dei metadati; un errore provoca la compensazione. Le eliminazioni accodano le chiavi nella stessa transazione che rimuove i metadati. Un errore del filesystem lascia una voce da riprovare. Archiviare preserva gli allegati; eliminare definitivamente elimina anche i file. All’avvio Docker, la manutenzione riprova la coda e rimuove gli oggetti senza riferimenti più vecchi di 24 ore, inclusi quelli lasciati da un arresto improvviso durante un caricamento.

## Configurazione e limiti

- `MAX_ATTACHMENT_SIZE_MB=25`: limite totale per richiesta, configurabile tra 1 e 256 MB; massimo 10 file per caricamento e 100 per elemento.
- `ATTACHMENT_STORAGE_PATH=./data/attachments`: sviluppo locale. In Docker è `/data/attachments`, volume `secondbrain-attachments`, proprietario UID/GID 1001.
- JPEG, PNG, WebP, GIF; MP3, M4A, WAV, Ogg/WebM; PDF, TXT, Markdown.
- MediaRecorder usa i formati supportati dal browser. HTTPS o localhost e il consenso al microfono sono necessari. Senza supporto si può caricare un audio esistente.
- Le immagini incollate nell’editor vengono salvate come allegati subito; il riferimento Markdown viene salvato con Salva modifiche. Se si abbandona il testo, il file resta raggiungibile nella sezione Allegati.
- Nessuna quota globale per utente, scansione antivirus, conversione media o storage S3. Monitorare la capacità del volume. Le richieste e i file sono bufferizzati entro il limite configurato; mantenerlo adeguato alla memoria del server.
- Il browser decide il supporto di riproduzione audio e PDF. Il download resta disponibile.

Per avviare manualmente la manutenzione, fermare prima l’applicazione e usare `docker compose run --rm --no-deps -T --entrypoint node secondbrain-web scripts/attachment-backup.mjs maintain`, quindi riavviare il servizio. Backup e ripristino coordinati sono descritti in [operations.md](operations.md).
