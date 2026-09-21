import Link from "next/link";
export default function NotFound() {
  return (
    <div className="standalone-state">
      <h1>Un’idea fuori portata.</h1>
      <p>Questa pagina non esiste o non è più disponibile.</p>
      <Link href="/" className="button button-primary">
        Torna allo spazio personale
      </Link>
    </div>
  );
}
