"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square } from "lucide-react";

export function AudioRecorder({
  onRecorded,
  onRecordingChange,
  maxBytes,
}: {
  onRecorded: (file: File, duration: number) => void;
  onRecordingChange: (recording: boolean) => void;
  maxBytes: number;
}) {
  const [state, setState] = useState<
    "idle" | "requesting" | "recording" | "paused"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const elapsed = useRef(0);
  const started = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(
      () =>
        setSeconds(
          Math.floor((elapsed.current + Date.now() - started.current) / 1000),
        ),
      250,
    );
    return () => clearInterval(timer);
  }, [state]);
  async function start() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "La registrazione richiede un browser compatibile e HTTPS (o localhost). Puoi comunque caricare un file audio.",
      );
      return;
    }
    setError("");
    setState("requesting");
    onRecordingChange(true);
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!alive.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((value) => MediaRecorder.isTypeSupported(value));
      const instance = new MediaRecorder(
        acquired,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = instance;
      const chunks: Blob[] = [];
      let total = 0;
      let tooLarge = false;
      let failed = false;
      instance.ondataavailable = (event) => {
        if (!event.data.size) return;
        total += event.data.size;
        chunks.push(event.data);
        if (total > maxBytes && instance.state !== "inactive") {
          tooLarge = true;
          instance.stop();
        }
      };
      instance.onerror = () => {
        failed = true;
        if (alive.current)
          setError(
            "Registrazione interrotta. Controlla il microfono e riprova.",
          );
        if (instance.state !== "inactive") instance.stop();
      };
      instance.onstop = () => {
        acquired.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        stream.current = null;
        if (!alive.current) return;
        onRecordingChange(false);
        setState("idle");
        if (failed) return;
        if (tooLarge || total > maxBytes) {
          setError(
            "La registrazione supera il limite. Registra un memo più breve.",
          );
          return;
        }
        const format = instance.mimeType.split(";")[0] || "audio/webm";
        const extension = format.includes("mp4")
          ? "m4a"
          : format.includes("ogg")
            ? "ogg"
            : "webm";
        const duration =
          (elapsed.current +
            (started.current ? Date.now() - started.current : 0)) /
          1000;
        if (total)
          onRecorded(
            new File(chunks, `memo-${Date.now()}.${extension}`, {
              type: format,
            }),
            duration,
          );
      };
      elapsed.current = 0;
      started.current = Date.now();
      setSeconds(0);
      instance.start(500);
      setState("recording");
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (alive.current) {
        setState("idle");
        onRecordingChange(false);
        setError(
          "Microfono non disponibile o accesso negato. Puoi caricare un file audio.",
        );
      }
    }
  }
  function pause() {
    if (recorder.current?.state === "recording") {
      elapsed.current += Date.now() - started.current;
      started.current = 0;
      recorder.current.pause();
      setState("paused");
    } else if (recorder.current?.state === "paused") {
      started.current = Date.now();
      recorder.current.resume();
      setState("recording");
    }
  }
  return (
    <div className="audio-recorder">
      <div className="audio-recorder-status" role="status">
        <Mic size={18} />
        <span>
          {state === "requesting"
            ? "Attendo il microfono…"
            : state === "recording"
              ? "Registrazione in corso"
              : state === "paused"
                ? "In pausa"
                : "Registra un memo vocale"}
        </span>
        <time>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </time>
      </div>
      <div className="audio-recorder-actions">
        {state === "idle" ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={start}
          >
            <Mic size={15} />
            Registra
          </button>
        ) : (
          state !== "requesting" && (
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={pause}
              >
                {state === "paused" ? <Play size={15} /> : <Pause size={15} />}
                {state === "paused" ? "Riprendi" : "Pausa"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => recorder.current?.stop()}
              >
                <Square size={14} />
                Termina
              </button>
            </>
          )
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
