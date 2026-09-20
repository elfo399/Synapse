import "dotenv/config";
import { prisma } from "../src/lib/db";
import { createItem, updateItem } from "../src/server/items";
import { createRelation } from "../src/server/relations";
import type { ItemInput } from "../src/domain/types";
import { bootstrapUser } from "./bootstrap";

async function seed() {
  if (process.env.NODE_ENV === "production") throw new Error("The example dataset is for development only. Production startup never seeds content.");
  const userId = await bootstrapUser();
  if (await prisma.item.count({ where: { userId } })) { console.info("Workspace already contains items; seed left it unchanged."); return; }
  const fixtures: ItemInput[] = [
    { title: "Apprendimento e curiosità", type: "AREA", content: "Fai spazio alla concentrazione, alla pratica consapevole e ai collegamenti inattesi.", tags: ["apprendimento"] },
    { title: "Infrastruttura domestica", type: "AREA", content: "Strumenti affidabili e privati che possiedo e comprendo.", tags: ["homelab", "sistemi"] },
    { title: "Organizzare le conoscenze con Synapse", type: "PROJECT", status: "IN_PROGRESS", content: "## Obiettivo\nUno spazio affidabile per idee, decisioni e prossime azioni.\n\nInizia con le [[Note atomiche]], crea collegamenti con la [[Sintesi progressiva]] e prendi l’abitudine della [[Revisione settimanale]].", tags: ["conoscenza", "personale"] },
    { title: "Server domestico Raspberry Pi", type: "PROJECT", content: "Un server personale silenzioso basato su [[Docker Compose]], [[PostgreSQL]] e [[Tailscale]].\n\nConsulta la [[Strategia di backup]] prima di aggiungere servizi.", tags: ["homelab", "infrastruttura"] },
    { title: "Note atomiche", content: "# Una nota, un’idea\n\nUna nota utile descrive una sola idea con parole tue. Scegli un titolo chiaro e collegala ad altri pensieri pertinenti.\n\n- Mantieni l’idea abbastanza semplice da poterla riutilizzare\n- Scrivi per il tuo io futuro\n- Aggiungi un collegamento quando spiega una relazione\n\nQuesto metodo si integra con la [[Sintesi progressiva]] e [[Il valore di una buona domanda]].", tags: ["conoscenza", "scrittura"] },
    { title: "Sintesi progressiva", type: "RESOURCE", content: "Conserva il contesto originale, poi rendi più facile ritrovare le parti utili.\n\n**Livello 1:** Raccogli.\n**Livello 2:** Evidenzia.\n**Livello 3:** Riassumi con parole tue.\n\nCollega il risultato alle [[Note atomiche]].", tags: ["conoscenza", "apprendimento"] },
    { title: "Revisione settimanale", content: "## Venerdì, 20 minuti\n\n1. Organizza i pensieri raccolti.\n2. Rivedi i progetti attivi.\n3. Archivia ciò che non è più attivo.\n4. Scegli un’azione concreta da compiere.\n\nRivedi [[Organizzare le conoscenze con Synapse]] e [[Server domestico Raspberry Pi]].", tags: ["abitudini", "personale"] },
    { title: "PostgreSQL", type: "RESOURCE", content: "Un database relazionale affidabile con ottime funzioni di ricerca integrate.\n\n```sql\nSELECT to_tsvector('italian', 'Le conoscenze collegate in Synapse');\n```\n\nEseguilo con [[Docker Compose]]. Proteggilo con una [[Strategia di backup]].", tags: ["database", "infrastruttura"] },
    { title: "Docker Compose", type: "RESOURCE", content: "Definisci i servizi di una piccola applicazione in un solo file. Conserva i dati del database in volumi persistenti.\n\nUn volume conserva i dati, ma non sostituisce una copia di sicurezza. Consulta la [[Strategia di backup]].", tags: ["docker", "infrastruttura"] },
    { title: "Tailscale", type: "RESOURCE", content: "Accesso privato al [[Server domestico Raspberry Pi]] senza esporre il database a Internet. Usa HTTPS per le sessioni del browser.", tags: ["reti", "homelab"] },
    { title: "Strategia di backup", content: "## L’obiettivo è poter ripristinare\n\nCrea ogni notte una copia logica di [[PostgreSQL]]. Cifra una copia su un dispositivo separato. Verifica regolarmente il ripristino.\n\n> Una copia di sicurezza mai ripristinata è solo un’ipotesi.\n\nDocumenta la procedura in [[Server domestico Raspberry Pi]].", tags: ["backup", "infrastruttura"] },
    { title: "Il valore di una buona domanda", content: "Raccogli le domande insieme alle risposte. Una domanda precisa aiuta a riconoscere e collegare nuove informazioni.\n\nProva durante la [[Revisione settimanale]].", tags: ["apprendimento", "scrittura"] },
    { title: "Verificare il ripristino del database", type: "TASK", status: "TODO", dueAt: new Date().toISOString(), content: "Ripristina una copia recente in un database temporaneo e verifica il numero di righe. Segui la [[Strategia di backup]].", tags: ["backup"] },
    { title: "Collegare tre note utili", type: "TASK", status: "IN_PROGRESS", dueAt: new Date().toISOString(), content: "Cerca un collegamento significativo tra le [[Note atomiche]] e le letture di questa settimana.", tags: ["conoscenza"] },
    { title: "Configurare l’accesso privato", type: "TASK", status: "DONE", content: "Configurato [[Tailscale]] per il server domestico.", tags: ["homelab"] },
    { title: "Documentazione PostgreSQL", type: "BOOKMARK", url: "https://www.postgresql.org/docs/", content: "Documentazione ufficiale di [[PostgreSQL]], inclusi gli indici e la ricerca nel testo.", tags: ["database", "riferimenti"] },
    { title: "Un’idea per il fine settimana", inbox: true, content: "Un piccolo rituale di lettura potrebbe aiutarmi a trasformare gli articoli interessanti in qualcosa di utile?" },
    { title: "Esplorare i programmi con dati locali", inbox: true, content: "Esplora come il controllo sui dati e la loro portabilità cambiano la scelta degli strumenti.", tags: ["apprendimento"] },
    { title: "Un precedente esperimento di organizzazione", archived: true, content: "Un vecchio esperimento di organizzazione. Conservato come riferimento e sostituito da [[Organizzare le conoscenze con Synapse]].", tags: ["personale"] },
  ];
  const ids = new Map<string, string>();
  for (const fixture of fixtures) {
    const item = await createItem(userId, { inbox: false, ...fixture });
    ids.set(item.title, item.id);
  }
  const parenting: [string, string][] = [
    ["Organizzare le conoscenze con Synapse", "Apprendimento e curiosità"], ["Server domestico Raspberry Pi", "Infrastruttura domestica"],
    ["Note atomiche", "Organizzare le conoscenze con Synapse"], ["Revisione settimanale", "Organizzare le conoscenze con Synapse"],
    ["Collegare tre note utili", "Organizzare le conoscenze con Synapse"], ["Verificare il ripristino del database", "Server domestico Raspberry Pi"],
    ["Configurare l’accesso privato", "Server domestico Raspberry Pi"], ["PostgreSQL", "Infrastruttura domestica"],
    ["Docker Compose", "Infrastruttura domestica"], ["Strategia di backup", "Server domestico Raspberry Pi"],
  ];
  for (const [child, parent] of parenting) await updateItem(userId, ids.get(child)!, { parentIds: [ids.get(parent)!] });
  await createRelation(userId, { sourceItemId: ids.get("Sintesi progressiva")!, targetItemId: ids.get("Il valore di una buona domanda")!, relationType: "RELATED" });
  console.info(`Seed complete: ${fixtures.length} items with tags, tasks, PARA organization, and a connected graph.`);
}

seed().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Seed failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
