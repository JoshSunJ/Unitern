"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import LocationSearch from "@/components/LocationSearch";
import { listingIdFromPath, type ChatArea, type ChatReply, type ListingOption } from "@/features/housing-chat/types";

type Message = { role: "user"; text: string } | ({ role: "assistant"; text: string } & Omit<ChatReply, "answer">);
const starters = [
  ["Food & hangouts", "Give me a concise overview of restaurants, cafes and fun places near this location."],
  ["Safety & neighborhood", "What should I check about this neighborhood and safety before moving in?"],
  ["Move-in checklist", "What are the most important questions to ask before renting this home?"],
] as const;

export default function HousingChat() {
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  const [listingId, setListingId] = useState<number | null>(listingIdFromPath(pathname));
  const [area, setArea] = useState<ChatArea | null>(null);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [options, setOptions] = useState<ListingOption[]>([]);
  const [conversations, setConversations] = useState<Record<string, Message[]>>({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [metadataError, setMetadataError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);

  // Update only when the path changes. Root-layout state retains the selected
  // home and separate conversations throughout client navigation.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    const viewedId = listingIdFromPath(pathname);
    if (viewedId !== null) setListingId(viewedId);
  }

  const key = listingId ? `listing:${listingId}` : area ? `area:${area.latitude}:${area.longitude}` : "general";
  const messages = conversations[key] ?? [];
  const waiting = Math.max(0, Math.ceil((retryAt - clock) / 1_000));
  const selected = options.find(option => option.id === listingId);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/housing-chat${listingId ? `?listingId=${listingId}` : ""}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The guide is temporarily unavailable.");
        if (!controller.signal.aborted) { setEnabled(data.enabled); setOptions(data.listings); setMetadataError(""); }
      }).catch(error => {
        if (!controller.signal.aborted) { setEnabled(false); setMetadataError(error instanceof Error ? error.message : "Could not connect to the guide."); }
      });
    return () => controller.abort();
  }, [open, listingId]);

  useEffect(() => { if (open) question.current?.focus(); }, [open]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages.length, pending]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => { const now = Date.now(); setClock(now); if (now >= retryAt) setRetryAt(0); }, 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function close() { setOpen(false); launcher.current?.focus(); }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length < 2 || pending || !consent || !enabled || waiting > 0) return;
    const outgoing: Message = { role: "user", text };
    const currentMessages = [...messages, outgoing].slice(-40);
    setConversations(previous => ({ ...previous, [key]: currentMessages }));
    setDraft(""); setError(""); setPending(true);
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch("/api/housing-chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: text, listingId, area: listingId ? null : area, consent,
          history: messages.slice(-6).map(message => ({ role: message.role, text: message.text })) }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Math.min(86_400, Math.max(1, Number(response.headers.get("Retry-After")) || 60));
          setClock(Date.now()); setRetryAt(Date.now() + seconds * 1_000);
        }
        throw new Error(data.error || "The guide couldn't answer just now.");
      }
      const reply = data as ChatReply;
      setConversations(previous => ({ ...previous, [key]: [...currentMessages, { role: "assistant", text: reply.answer, sources: reply.sources, listing: reply.listing, mapStatus: reply.mapStatus }] }));
    } catch (error) {
      if (!controller.signal.aborted) {
        setConversations(previous => ({ ...previous, [key]: messages }));
        setError(error instanceof Error ? error.message : "Could not reach the guide. Please try again."); setDraft(text);
      }
    } finally { setPending(false); request.current = null; }
  }

  return <div className="housing-chat">
    <button ref={launcher} className="housing-chat__launcher" aria-label={open ? "Close housing guide" : "Open housing guide"}
      aria-expanded={open} aria-controls="housing-guide" onClick={() => open ? close() : setOpen(true)}>
      <span aria-hidden="true">✦</span><span>Ask about the area</span>
    </button>
    {open && <section id="housing-guide" role="dialog" aria-label="Unitern housing guide" className="housing-chat__panel"
      onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); close(); } }}>
      <header className="housing-chat__header">
        <div><p className="eyebrow">UNITERN GUIDE <span>AI</span></p><h2>Before you move.</h2></div>
        <button type="button" className="housing-chat__icon" aria-label="Close chat window" onClick={close}>×</button>
      </header>
      <div className="housing-chat__body">
      <div className="housing-chat__context">
        <label htmlFor="chat-listing">ASKING ABOUT</label>
        <select id="chat-listing" value={listingId ?? ""} disabled={pending} onChange={event => { setListingId(event.target.value ? Number(event.target.value) : null); setError(""); }}>
          <option value="">Explore an area / general questions</option>
          {listingId && !selected && <option value={listingId}>Current listing</option>}
          {options.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
        </select>
        {selected ? <p>{selected.location}</p> : !listingId && <fieldset className="housing-chat__area" disabled={pending}>
          <LocationSearch label="Search an area" kind="address" placeholder="City, neighborhood or public place" value={area?.label ?? ""}
            onInputChange={() => setArea(null)} onSelect={result => { setArea({ label: result.label, ...result.coordinates }); setError(""); }} />
        </fieldset>}
      </div>
      <div ref={log} className="housing-chat__log" role="log" aria-label="Housing guide conversation" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && <div className="housing-chat__welcome">
          <span className="housing-chat__spark" aria-hidden="true">✦</span>
          <h3>Get to know your next chapter.</h3>
          <p>Ask about nearby food, places to unwind, the neighborhood, or what to check before signing a lease.</p>
          <div className="housing-chat__starters">{starters.map(([label, text]) => <button key={label} type="button" onClick={() => { setDraft(text); question.current?.focus(); }}>{label} ↗</button>)}</div>
        </div>}
        {messages.map((message, index) => <article key={index} className={`housing-chat__message housing-chat__message--${message.role}`}>
          <span className="housing-chat__speaker">{message.role === "user" ? "YOU" : "UNITERN GUIDE"}</span>
          <p>{message.text}</p>
          {message.role === "assistant" && <>
            {message.sources.length > 0 && <ul className="housing-chat__sources" aria-label="Answer sources">{message.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>)}</ul>}
            {message.mapStatus === "unavailable" && <small>Nearby map data was unavailable for this answer.</small>}
          </>}
        </article>)}
        {pending && <p className="housing-chat__thinking" role="status">Checking the details<span aria-hidden="true">…</span></p>}
      </div>
      <div className="housing-chat__notice">
        {!consent ? <>
          <p>Google receives your question and selected location or public listing details. Free-tier chats may be reviewed to improve Google’s models. Avoid personal or sensitive details. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">How data is used ↗</a></p>
          <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I’m 18 or older and understand how this chat uses my data.</label>
        </> : <details><summary>About this AI guide</summary><p>Google processes questions and selected locations; free-tier chats may be used to improve its models. Nearby places use © OpenStreetMap contributors. Verify details before moving. This conversation stays in this tab while you browse.</p><button type="button" disabled={pending} onClick={() => { setConversations(previous => ({ ...previous, [key]: [] })); setError(""); }}>Clear this conversation</button></details>}
      </div>
      </div>
      <form className="housing-chat__form" onSubmit={send}>
        <label className="housing-chat__sr" htmlFor="housing-question">Your housing question</label>
        <textarea ref={question} id="housing-question" value={draft} minLength={2} maxLength={1_000} required rows={2} placeholder="What would you like to know?" disabled={pending}
          onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <button type="submit" aria-label="Send housing question" disabled={pending || !consent || !enabled || draft.trim().length < 2 || waiting > 0}><span aria-hidden="true">↑</span></button>
      </form>
      <div className="housing-chat__status" role="status">
        {error || metadataError || (enabled === false ? "The guide is temporarily unavailable." : enabled === null ? "Connecting to the guide…" : "Powered by free Gemini AI · Nearby data from OpenStreetMap")}
        {waiting > 0 && <span> Retry in {waiting >= 60 ? `${Math.ceil(waiting / 60)} min` : `${waiting}s`}.</span>}
      </div>
    </section>}
  </div>;
}
