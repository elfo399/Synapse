"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Hash, Search } from "lucide-react";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import { useRemote } from "@/features/items/use-remote";
import type { Tag } from "@/features/items/types";
import "../items/collections.css";

export function TagsPage() {
  const { data, error, loading, reload } = useRemote<{ tags: Tag[] }>(
    "/api/tags",
  );
  const [query, setQuery] = useState("");
  const tags =
    data?.tags.filter((tag) =>
      tag.name
        .toLocaleLowerCase("it-IT")
        .includes(query.toLocaleLowerCase("it-IT")),
    ) || [];
  return (
    <div className="page collection-page tag-index">
      <PageHeader
        title="Etichette"
        description="Percorsi diversi attraverso le tue note."
      />
      <div className="collection-toolbar">
        <div className="collection-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Cerca un’etichetta"
            placeholder="Cerca un’etichetta…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="tag-index-count">{tags.length} etichette</span>
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : tags.length ? (
        <div className="tag-index-list">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags?tag=${encodeURIComponent(tag.name)}`}
              className="tag-index-row"
            >
              <Hash size={16} />
              <span>{tag.name}</span>
              <small>
                {tag.count || 0}{" "}
                {(tag.count || 0) === 1 ? "elemento" : "elementi"}
              </small>
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            query ? "Nessuna etichetta trovata" : "Ancora nessuna etichetta"
          }
          description={
            query
              ? "Prova un’altra parola."
              : "Aggiungi etichette alle tue note per ritrovarle qui."
          }
        />
      )}
    </div>
  );
}
