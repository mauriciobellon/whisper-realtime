// src/components/RealtimeTranscriber.tsx
import React, { useState, useRef, useEffect } from "react";
import * as ort from "onnxruntime-web";
import { MicVAD } from "@ricky0123/vad"; // Silero VAD package
import Constants from "../utils/Constants";
import Transcript from "./Transcript";

// Configure onnxruntime's WASM URL so it loads from our public folder.
ort.env.wasm.wasmPaths = "/assets/onnxruntime/";

// Define types for transcription data (as expected by Transcript.tsx)
interface Chunk {
  text: string;
  timestamp: [number, number | null];
}

export interface Transcriber {
  model: string;
  multilingual: boolean;
  quantized: boolean;
  subtask: string;
  language: string;
  // ... plus any other configuration or methods you have
}

interface TranscriberData {
  isBusy: boolean;
  text: string;
  chunks: Chunk[];
}

interface RealtimeTranscriberProps {
  transcriber: Transcriber;
}

export default function RealtimeTranscriber({
  transcriber,
}: RealtimeTranscriberProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedData, setTranscribedData] = useState<TranscriberData>({
    isBusy: false,
    text: "",
    chunks: [],
  });

  // References for our transcription worker and Silero VAD instance.
  const workerRef = useRef<Worker | null>(null);
  const vadRef = useRef<any>(null);

  // Handler for messages from the transcription worker.
  const handleWorkerMessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.status === "update" || message.status === "complete") {
      const receivedText: string = message.data.text;
      const cleanedText = receivedText
        .replace(/\[BLANK_AUDIO\]/gi, "")
        .replace(/\[Music\]/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!cleanedText || /^\d+:\d{2}:\d{2}$/.test(cleanedText)) {
        return;
      }
      setTranscribedData((prev) => {
        const newText = (prev.text + " " + cleanedText).trim();
        const newChunk: Chunk = {
          text: cleanedText,
          timestamp: [Date.now() / 1000, null],
        };
        return { isBusy: false, text: newText, chunks: [...prev.chunks, newChunk] };
      });
    }
    if (message.status === "error") {
      console.error("Worker error:", message.data);
    }
  };

  // Start realtime transcription: pre-load the chosen model and start VAD.
  const startTranscription = async () => {
    try {
      // Create and initialize the Whisper transcription worker.
      const worker = new Worker(new URL("../worker.js", import.meta.url), {
        type: "module",
      });
      worker.addEventListener("message", handleWorkerMessage);
      workerRef.current = worker;

      // Immediately instruct the worker to load the model using your chosen configuration.
      // This assumes your worker.js supports a "load" message.
      worker.postMessage({
        type: "load",
        model: transcriber.model,
        multilingual: transcriber.multilingual,
        quantized: transcriber.quantized,
        subtask: transcriber.subtask,
        language: transcriber.language,
      });

      // Create a Silero VAD instance with callbacks.
      const vadInstance = await MicVAD.new({
        onSpeechStart: () => {
          console.log("Speech detected. Starting speech chunk recording.");
          setTranscribedData((prev) => ({ ...prev, isBusy: true }));
        },
        onSpeechEnd: (audioChunk: Float32Array) => {
          console.log(
            "Speech ended. Received audio chunk of",
            audioChunk.length,
            "samples."
          );
          // Send the audio chunk to the transcription worker.
          if (workerRef.current) {
            workerRef.current.postMessage({
              type: "transcribe",
              audio: audioChunk,
              // Optionally, you may pass configuration again (or the worker can reuse its loaded model)
              model: transcriber.model,
              multilingual: transcriber.multilingual,
              quantized: transcriber.quantized,
              subtask: transcriber.subtask,
              language: transcriber.language,
            });
          }
        },
        onVADMisfire: () => {
          console.log("VAD misfire: no speech detected.");
        },
      });
      vadRef.current = vadInstance;
      vadInstance.start();
      setIsTranscribing(true);
    } catch (err) {
      console.error("Error starting realtime transcription:", err);
    }
  };

  // Stop realtime transcription: stop both the VAD and the worker.
  const stopTranscription = () => {
    setIsTranscribing(false);
    if (vadRef.current) {
      vadRef.current.stop();
      vadRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  };

  // Optionally, if you wish to pre-load the model earlier,
  // you could call startTranscription() on mount, or expose a "load" button separately.
  // For now, the user clicks "Start" and the model is loaded via the worker load message.

  return (
    <div className="p-4 border rounded my-4">
      <button
        onClick={isTranscribing ? stopTranscription : startTranscription}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-all duration-200"
      >
        {isTranscribing ? "Stop Realtime Transcription" : "Start Realtime Transcription"}
      </button>
      <div className="mt-4 p-4 border rounded">
        <h3 className="font-semibold">Realtime Transcript</h3>
        <Transcript transcribedData={transcribedData} />
      </div>
    </div>
  );
}
