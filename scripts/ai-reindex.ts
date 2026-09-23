import "dotenv/config";
import { processEmbeddingJobs, queueMissingEmbeddings } from "../src/server/ai-index";

async function main() {
  const rebuild = process.argv.includes("--rebuild");
  const queued = await queueMissingEmbeddings(rebuild);
  let done = 0;
  while (true) { const count = await processEmbeddingJobs(4); done += count; if (!count) break; }
  console.log(`Indicizzazione ${rebuild ? "ricostruita" : "aggiornata"}: ${queued} elementi in coda, ${done} elaborati.`);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
