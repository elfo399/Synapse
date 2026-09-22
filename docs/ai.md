# Assistente AI locale

Synapse include Ollama come container Docker privato per offrire un assistente locale. Non serve installare Ollama nel sistema operativo del Raspberry Pi: il modello, le conversazioni e le conoscenze restano nell’installazione Synapse. Con `AI_ENABLED=false` l’app non esegue chiamate al modello e tutte le altre funzioni restano disponibili.

## Raspberry Pi

Al primo deploy `docker compose up -d --build --wait` crea il container `ollama`, il volume persistente `ollama-models` e avvia il download di `llama3.2:3b`. Synapse è subito disponibile; finché il download non è terminato, la pagina **Assistente AI** indica che il modello è in preparazione.

```bash
docker compose ps
docker compose logs -f ollama
```

La configurazione standard non richiede impostazioni AI nel file `.env`: Synapse usa sempre il servizio Docker interno `ollama`. Se vuoi usare un altro modello, cambia solo `OLLAMA_MODEL` e ricrea lo stack.

```dotenv
OLLAMA_MODEL=llama3.2:3b
OLLAMA_TIMEOUT_MS=90000
AI_MAX_TOKENS=500
```

`compose.yaml` collega Synapse a Ollama soltanto tramite la rete Docker interna. La porta 11434 non è pubblicata sul Raspberry, sulla LAN o su Internet. Il volume `ollama-models` preserva il modello fra aggiornamenti e riavvii. Per riscaricare manualmente un modello, usa `docker compose exec ollama ollama pull llama3.2:3b`.

Apri **Assistente AI** nella sidebar. Lo stato indica se AI è disattivata, Ollama è irraggiungibile, il modello manca oppure è pronta.

## Verifica e problemi comuni

Dal Raspberry puoi controllare Ollama con:

```bash
docker compose exec ollama ollama list
docker compose exec secondbrain-web node -e "fetch('http://ollama:11434/api/tags').then(r=>r.json()).then(console.log)"
```

Se il secondo comando restituisce `connection refused`, controlla `docker compose ps` e `docker compose logs ollama`. Se il modello manca, ripeti `docker compose exec ollama ollama pull llama3.2:3b`. Con poca RAM o risposte lente, usa l’assistente una persona alla volta: Synapse consente una sola generazione contemporanea e limita contesto, cronologia e lunghezza della risposta.

## Privacy e backup

In modalità **Le mie conoscenze**, Synapse esegue ricerca full-text esclusivamente sugli Item dell’utente corrente, seleziona pochi estratti e li invia al modello locale. La modalità **Chat generale** non include note private. Le conversazioni sono conservate in PostgreSQL e quindi seguono i normali backup del database; eliminarne una rimuove anche i messaggi associati.

L’assistente non legge automaticamente PDF, immagini o audio, non esegue comandi e non modifica note, attività o Planner.
