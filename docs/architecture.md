# Architettura delle conoscenze

Synapse conserva tutte le conoscenze in un solo modello `Item`, con ruoli chiari:

- **Area**: ambito di responsabilità durevole. Può riunire progetti, risorse, note e attività indipendenti.
- **Progetto**: risultato con uno stato, una scadenza eventuale e attività misurabili. Può appartenere a un’Area.
- **Risorsa**: raccolta di contenuti sullo stesso tema. Può appartenere a un Progetto o a un’Area, oppure restare autonoma.
- **Note, attività e preferiti**: conoscenze atomiche, libere oppure organizzate in un contenitore.

## Contenitori e collegamenti

Una relazione `PARENT` parte dall’elemento organizzato e punta al suo contenitore. Ogni Item può avere più contesti `PARENT`, ma uno solo è `isPrimary`: è quello usato per breadcrumb e navigazione. Gli altri restano visibili come **Anche in**. `RELATED` collega concetti senza creare una gerarchia; `REFERENCES` rappresenta riferimenti, inclusi i wikilink nel testo.

Il server applica proprietà dell’utente, assenza di auto-collegamenti e cicli, compatibilità dei ruoli e unicità del contenitore principale. Eliminare un contenitore elimina solo le relazioni: gli elementi contenuti restano dell’utente e possono essere riorganizzati.

## Contenuti delle risorse

Una Risorsa non duplica dati in una tabella separata: usa il contenuto Markdown dell’Item, note e preferiti organizzati al suo interno e allegati già gestiti da Synapse. La schermata **Contenuti** offre azioni contestuali per testo, note, link e file; immagini, audio e documenti rimangono scaricabili o apribili con i controlli esistenti.

Questa scelta mantiene indicizzazione, ricerca, grafo, allegati e RAG su una fonte unica e preserva i dati creati dalle versioni precedenti.
