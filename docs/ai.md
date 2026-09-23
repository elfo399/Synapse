# Assistente AI locale

Synapse usa un'architettura AI interamente locale per le conoscenze personali:

```text
Browser → Synapse / Next.js
              ├─ PostgreSQL + pgvector (FTS, relazioni, chunk e vettori)
              ├─ Ollama (qwen3:1.7b + qwen3-embedding:0.6b)
              └─ SearXNG (solo ricerca Web opzionale, massimo 3 risultati)
```

`qwen3:1.7b` genera le risposte e `qwen3-embedding:0.6b` crea vettori da 1024 dimensioni per piccoli blocchi di testo. PostgreSQL resta l'unico archivio delle conoscenze: ogni chunk punta al suo Item originale, è filtrato per proprietario e viene salvato nei normali backup.

La ricerca nelle conoscenze combina FTS PostgreSQL e similarità pgvector con reciprocal rank fusion. Se il modello di embedding non è temporaneamente disponibile, Synapse continua con FTS; non usa mai elementi recenti come ripiego. Le note vuote non vengono usate come prova testuale.

Le modalità dell'assistente sono:

- **Chat generale**: solo Qwen locale.
- **Le mie conoscenze**: recupero ibrido da Synapse.
- **Cerca sul Web**: SearXNG, massimo tre risultati.
- **Synapse + Web**: entrambe le fonti, sempre separate nella risposta.

## Preferenze della conversazione

Sotto il campo di scrittura ci sono due interruttori indipendenti, entrambi disattivati nelle nuove chat:

- **Ricerca Web** cerca tramite SearXNG fino a tre risultati. La domanda dell'utente è l'unico dato inviato al motore esterno; il toggle funziona anche nelle conversazioni che usano le conoscenze Synapse.
- **Ragionamento** invia `think: true` a Qwen3. Con il toggle spento Synapse usa `think: false`, privilegiando la rapidità. Il testo interno di ragionamento non viene trasmesso al browser né salvato.

Le preferenze vengono salvate nella conversazione e con ciascun messaggio. Se SearXNG non è raggiungibile, una richiesta con Ricerca Web attiva restituisce un errore chiaro e non finge di aver cercato. Se il modello configurato non supporta il ragionamento, il relativo controllo resta disabilitato.

Nella modalità combinata SearXNG riceve esclusivamente la domanda digitata. Corpi delle note, URL privati, allegati, identificativi interni e credenziali non vengono mai inclusi nella richiesta Web.

## Indicizzazione

I salvataggi degli Item accodano il lavoro in PostgreSQL e non aspettano l'inferenza. Per indicizzare contenuti esistenti o recuperare lavori mancanti:

```bash
npm run ai:reindex
```

Per ricostruire intenzionalmente l'intero indice vettoriale:

```bash
npm run ai:rebuild
```

Il secondo comando cancella e rigenera solo i chunk derivati; gli Item originali non vengono mai modificati.

## Risorse sul Raspberry Pi

La configurazione usa un contesto di 4096 token, un massimo di 500 token in uscita e un'unica inferenza alla volta. Ollama mantiene un solo modello in memoria per ridurre la RAM occupata: il passaggio tra generazione ed embedding può quindi aggiungere latenza. Non sono state effettuate misurazioni su hardware Raspberry Pi.

Synapse include Ollama come container Docker privato per offrire un assistente locale. Non serve installare Ollama nel sistema operativo del Raspberry Pi: il modello, le conversazioni e le conoscenze restano nell’installazione Synapse. Con `AI_ENABLED=false` l’app non esegue chiamate al modello e tutte le altre funzioni restano disponibili.

## Raspberry Pi

Al primo deploy `docker compose up -d --build --wait` crea il container `ollama`, il volume persistente `ollama-models` e avvia il download di `qwen3:1.7b`. Synapse è subito disponibile; finché il download non è terminato, la pagina **Assistente AI** indica che il modello è in preparazione.

```bash
docker compose ps
docker compose logs -f ollama
```

La configurazione standard non richiede impostazioni AI nel file `.env`: Synapse usa sempre il servizio Docker interno `ollama`. Se vuoi usare un altro modello, cambia solo `OLLAMA_MODEL` e ricrea lo stack.

```dotenv
OLLAMA_MODEL=qwen3:1.7b
OLLAMA_TIMEOUT_MS=90000
AI_MAX_TOKENS=500
```

`compose.yaml` collega Synapse a Ollama soltanto tramite la rete Docker interna. La porta 11434 non è pubblicata sul Raspberry, sulla LAN o su Internet. Il volume `ollama-models` preserva i modelli fra aggiornamenti e riavvii: cambiare il modello predefinito non cancella quelli già scaricati. Per riscaricare manualmente Qwen3, usa `docker compose exec ollama ollama pull qwen3:1.7b`.

Qwen3 usa risposte dirette con `think: false`, mantenendo lo streaming. Puoi usare anche `llama3.2:3b` impostando `OLLAMA_MODEL=llama3.2:3b`: Synapse conserva il formato di richiesta compatibile con Llama.

Apri **Assistente AI** nella sidebar. Lo stato indica se AI è disattivata, Ollama è irraggiungibile, il modello manca oppure è pronta.

## Verifica e problemi comuni

Dal Raspberry puoi controllare Ollama con:

```bash
docker compose exec ollama ollama list
docker compose exec secondbrain-web node -e "fetch('http://ollama:11434/api/tags').then(r=>r.json()).then(console.log)"
```

Se il secondo comando restituisce `connection refused`, controlla `docker compose ps` e `docker compose logs ollama`. Se il modello manca, ripeti `docker compose exec ollama ollama pull qwen3:1.7b`. Con poca RAM o risposte lente, usa l’assistente una persona alla volta: Synapse consente una sola generazione contemporanea e limita contesto, cronologia e lunghezza della risposta.

## Privacy e backup

In modalità **Le mie conoscenze**, Synapse esegue ricerca full-text esclusivamente sugli Item dell’utente corrente, seleziona pochi estratti e li invia al modello locale. La modalità **Chat generale** non include note private. Le conversazioni sono conservate in PostgreSQL e quindi seguono i normali backup del database; eliminarne una rimuove anche i messaggi associati.

L’assistente non legge automaticamente PDF, immagini o audio, non esegue comandi e non modifica note, attività o Planner.
