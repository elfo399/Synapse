"use client";

import { ErrorState } from "@/components/ui";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page">
      <ErrorState
        message="Impossibile caricare la pagina. I contenuti salvati sono al sicuro."
        retry={reset}
      />
    </div>
  );
}
