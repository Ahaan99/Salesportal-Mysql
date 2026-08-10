"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
}

const GREETING: AssistantMessage = {
  role: "assistant",
  text: "Hi, I'm Recruweb Assistant. Ask me anything about selling, orders, commissions, or how the portal works.",
};

/** Minimal typing for the Web Speech API (Chrome/Edge webkit prefix). */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

function createRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  if (!Ctor) return null;
  try {
    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    return rec;
  } catch {
    return null;
  }
}

/** Strip markdown/symbols so text-to-speech reads naturally. */
function toSpeakable(text: string): string {
  return text
    .replace(/[*_#`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/₹/g, " rupees ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([GREETING]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // True when the current question came in by voice — spoken questions get spoken answers.
  const voiceTurnRef = useRef(false);
  const speakRepliesRef = useRef(false);
  speakRepliesRef.current = speakReplies;

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(toSpeakable(text));
      utterance.lang = navigator.language || "en-IN";
      utterance.rate = 1.05;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    []
  );

  useEffect(() => {
    setVoiceSupported(createRecognition() !== null);
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Closing the panel silences any in-progress speech.
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open, stopSpeaking]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, sending]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || sending) return;
      setInput("");

      const nextMessages: AssistantMessage[] = [...messages, { role: "user", text }];
      setMessages(nextMessages);
      setSending(true);
      try {
        const { reply } = await api<{ reply: string }>("/api/assistant/chat", {
          method: "POST",
          // Skip the local greeting; only real turns go to the model.
          body: { messages: nextMessages.filter((m) => m !== GREETING) },
        });
        setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
        if (voiceTurnRef.current || speakRepliesRef.current) {
          speak(reply);
        }
        voiceTurnRef.current = false;
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.";
        setMessages((prev) => [...prev, { role: "assistant", text: msg }]);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [input, messages, sending, speak]
  );

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = createRecognition();
    if (!rec) return;
    stopSpeaking(); // don't listen while the assistant is still talking
    recognitionRef.current = rec;
    rec.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) =>
        event.results[i][0] ? event.results[i][0].transcript : ""
      )
        .join(" ")
        .trim();
      if (transcript) {
        setInput(transcript);
        voiceTurnRef.current = true;
        // Small delay so the user sees what was heard before it sends.
        setTimeout(() => send(transcript), 400);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, [listening, send, stopSpeaking]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl transition-transform hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 left-6 z-50 flex h-[520px] w-[min(380px,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            role="dialog"
            aria-label="Recruweb AI assistant"
          >
            <header className="flex items-center gap-2.5 border-b border-border bg-secondary/50 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Recruweb Assistant</span>
                <span className="text-xs text-muted-foreground">
                  AI-powered help{voiceSupported ? " · voice enabled" : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (speaking) stopSpeaking();
                  setSpeakReplies((v) => !v);
                }}
                aria-label={speakReplies ? "Turn off spoken replies" : "Turn on spoken replies"}
                aria-pressed={speakReplies}
                title={speakReplies ? "Spoken replies on" : "Spoken replies off"}
                className={cn(
                  "ml-auto flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                  speakReplies
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:text-foreground",
                  speaking && "animate-pulse"
                )}
              >
                {speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  )}
                >
                  {m.text}
                </div>
              ))}
              {sending && (
                <div className="flex max-w-[85%] items-center gap-2 rounded-xl bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking...
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={listening ? "Stop listening" : "Speak your question"}
                  aria-pressed={listening}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                    listening
                      ? "animate-pulse border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !(e.nativeEvent.isComposing || e.keyCode === 229)
                  ) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={listening ? "Listening..." : "Ask about selling, orders..."}
                aria-label="Message the AI assistant"
                disabled={sending}
                className="h-9 flex-1 rounded-full border border-input bg-background px-3.5 text-sm outline-none transition-colors focus:border-ring disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={sending || input.trim() === ""}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
