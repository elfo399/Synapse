import { Suspense } from "react";
import { GraphView } from "@/features/graph/graph-view";
import { Loading } from "@/components/ui";

export default function GraphPage() {
  return (
    <Suspense fallback={<Loading label="Apertura del grafo…" />}>
      <GraphView />
    </Suspense>
  );
}
