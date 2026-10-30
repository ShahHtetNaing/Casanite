"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Check, Loader2, Pencil, Plus, Quote, RefreshCw, Trash2, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { DailyMind, SavedQuote, SavedWord } from "@/lib/types";

type Props = { initialMind: DailyMind | null; initialQuotes: SavedQuote[]; initialWords: SavedWord[] };
type Part = "quote" | "word" | "all";

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    toast.error("This browser can't read text aloud.");
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  const voice = synth.getVoices().find((v) => v.lang.startsWith("en-US")) ?? synth.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  synth.speak(u);
}

const splitList = (s: string, sep: RegExp) =>
  s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

export function MindWords({ initialMind, initialQuotes, initialWords }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [mind, setMind] = useState(initialMind);
  const [loading, setLoading] = useState<Part | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [words, setWords] = useState(initialWords);
  const started = useRef(false);

  async function generate(part: Part, refresh: boolean) {
    setLoading(part);
    setAiError(null);
    try {
      const res = await fetch("/api/mind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part, refresh }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? "Couldn't generate today's card");
      setMind(json.mind as DailyMind);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't generate today's card";
      setAiError(msg);
      if (refresh) toast.error(msg);
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!initialMind?.quote || !initialMind?.word) void generate("all", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quoteSaved = !!mind?.quote && quotes.some((q) => q.quote.trim() === mind.quote!.quote.trim());
  const wordSaved = !!mind?.word && words.some((w) => w.word.toLowerCase() === mind.word!.word.toLowerCase());

  async function saveQuote(q: Omit<SavedQuote, "id" | "created_at">) {
    const { data, error } = await supabase.from("saved_quotes").insert(q).select("*").single();
    if (error) return toast.error(error.message), false;
    setQuotes((prev) => [data as SavedQuote, ...prev]);
    return true;
  }
  async function updateQuote(id: string, q: Omit<SavedQuote, "id" | "created_at">) {
    const { data, error } = await supabase.from("saved_quotes").update(q).eq("id", id).select("*").single();
    if (error) return toast.error(error.message), false;
    setQuotes((prev) => prev.map((x) => (x.id === id ? (data as SavedQuote) : x)));
    return true;
  }
  async function deleteQuote(id: string) {
    if (!confirm("Delete this quote?")) return;
    const { error } = await supabase.from("saved_quotes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setQuotes((prev) => prev.filter((x) => x.id !== id));
  }
  async function saveWord(w: Omit<SavedWord, "id" | "created_at">) {
    const { data, error } = await supabase.from("saved_words").insert(w).select("*").single();
    if (error) return toast.error(error.message), false;
    setWords((prev) => [data as SavedWord, ...prev]);
    return true;
  }
  async function updateWord(id: string, w: Omit<SavedWord, "id" | "created_at">) {
    const { data, error } = await supabase.from("saved_words").update(w).eq("id", id).select("*").single();
    if (error) return toast.error(error.message), false;
    setWords((prev) => prev.map((x) => (x.id === id ? (data as SavedWord) : x)));
    return true;
  }
  async function deleteWord(id: string) {
    if (!confirm("Delete this word?")) return;
    const { error } = await supabase.from("saved_words").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setWords((prev) => prev.filter((x) => x.id !== id));
  }

  const busy = (p: Part) => loading === p || loading === "all";

  return (
    <PageShell title="Mind & Words" subtitle="A new quote and word every day, plus the ones you've saved">
      {aiError && !mind && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {aiError}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Quote className="size-4 text-primary" />
            <CardTitle className="flex-1">Quote of the day</CardTitle>
            <Button variant="ghost" size="sm" disabled={!!loading} onClick={() => generate("quote", true)}>
              {busy("quote") ? <Loader2 className="animate-spin" /> : <RefreshCw />} New
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {mind?.quote ? (
              <>
                <blockquote className="text-lg leading-relaxed font-medium">“{mind.quote.quote}”</blockquote>
                {mind.quote.author && <p className="text-sm text-muted-foreground">— {mind.quote.author}</p>}
                <p className="rounded-xl bg-muted/60 p-3 text-sm">{mind.quote.breakdown}</p>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={quoteSaved}
                    onClick={() => saveQuote({ ...mind.quote!, breakdown: mind.quote!.breakdown || null }).then((ok) => ok && toast.success("Quote saved"))}
                  >
                    {quoteSaved ? <Check /> : <BookmarkPlus />} {quoteSaved ? "Saved" : "Save"}
                  </Button>
                </div>
              </>
            ) : (
              <Placeholder loading={busy("quote")} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Volume2 className="size-4 text-primary" />
            <CardTitle className="flex-1">Word of the day</CardTitle>
            <Button variant="ghost" size="sm" disabled={!!loading} onClick={() => generate("word", true)}>
              {busy("word") ? <Loader2 className="animate-spin" /> : <RefreshCw />} New
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {mind?.word ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-2xl font-semibold">{mind.word.word}</p>
                  {mind.word.part_of_speech && <span className="text-sm text-muted-foreground italic">{mind.word.part_of_speech}</span>}
                </div>
                <p className="text-sm">{mind.word.definition}</p>
                {mind.word.synonyms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {mind.word.synonyms.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                <ul className="grid gap-1.5 text-sm text-muted-foreground">
                  {mind.word.examples.map((ex) => (
                    <li key={ex} className="border-l-2 border-primary/40 pl-3 italic">
                      {ex}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => speak(mind.word!.word)}>
                    <Volume2 /> Pronounce
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={wordSaved}
                    onClick={() => saveWord(mind.word!).then((ok) => ok && toast.success("Word saved"))}
                  >
                    {wordSaved ? <Check /> : <BookmarkPlus />} {wordSaved ? "Saved" : "Save"}
                  </Button>
                </div>
              </>
            ) : (
              <Placeholder loading={busy("word")} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SavedList
          title={`Saved quotes (${quotes.length})`}
          noun="quote"
          items={quotes}
          empty="No saved quotes yet."
          render={(q) => (
            <>
              <p className="font-medium">“{q.quote}”</p>
              {q.author && <p className="text-xs text-muted-foreground">— {q.author}</p>}
              {q.breakdown && <p className="mt-1 text-sm text-muted-foreground">{q.breakdown}</p>}
            </>
          )}
          form={(q, done) => <QuoteForm initial={q} onCancel={done} onSave={async (v) => (q ? updateQuote(q.id, v) : saveQuote(v)).then((ok) => ok && done())} />}
          onDelete={(q) => deleteQuote(q.id)}
        />
        <SavedList
          title={`Saved words (${words.length})`}
          noun="word"
          items={words}
          empty="No saved words yet."
          render={(w) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{w.word}</p>
                {w.part_of_speech && <span className="text-xs text-muted-foreground italic">{w.part_of_speech}</span>}
                <Button variant="ghost" size="icon-xs" aria-label={`Pronounce ${w.word}`} onClick={() => speak(w.word)}>
                  <Volume2 />
                </Button>
              </div>
              {w.definition && <p className="text-sm">{w.definition}</p>}
              {w.synonyms.length > 0 && <p className="text-xs text-muted-foreground">Synonyms: {w.synonyms.join(", ")}</p>}
              {w.examples.map((ex) => (
                <p key={ex} className="text-xs text-muted-foreground italic">
                  {ex}
                </p>
              ))}
            </>
          )}
          form={(w, done) => <WordForm initial={w} onCancel={done} onSave={async (v) => (w ? updateWord(w.id, v) : saveWord(v)).then((ok) => ok && done())} />}
          onDelete={(w) => deleteWord(w.id)}
        />
      </div>
    </PageShell>
  );
}

function Placeholder({ loading }: { loading: boolean }) {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Writing today&apos;s card…
        </>
      ) : (
        "Not generated yet. Click New."
      )}
    </p>
  );
}

function SavedList<T extends { id: string }>({
  title,
  noun,
  items,
  empty,
  render,
  form,
  onDelete,
}: {
  title: string;
  noun: string;
  items: T[];
  empty: string;
  render: (item: T) => React.ReactNode;
  form: (item: T | null, done: () => void) => React.ReactNode;
  onDelete: (item: T) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="flex-1">{title}</CardTitle>
        {editing !== "new" && (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add {noun}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-2">
        {editing === "new" && form(null, () => setEditing(null))}
        {items.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">{empty}</p>}
        {items.map((item) =>
          editing === item.id ? (
            <div key={item.id}>{form(item, () => setEditing(null))}</div>
          ) : (
            <div key={item.id} className="group flex gap-2 rounded-xl border p-3">
              <div className="min-w-0 flex-1">{render(item)}</div>
              <div className="flex shrink-0 items-start gap-0.5">
                <Button variant="ghost" size="icon-xs" aria-label={`Edit ${noun}`} onClick={() => setEditing(item.id)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Delete ${noun}`} onClick={() => onDelete(item)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}

function FormButtons({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        <X /> Cancel
      </Button>
    </div>
  );
}

function QuoteForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SavedQuote | null;
  onSave: (v: Omit<SavedQuote, "id" | "created_at">) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [quote, setQuote] = useState(initial?.quote ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [breakdown, setBreakdown] = useState(initial?.breakdown ?? "");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote.trim()) return toast.error("Quote can't be empty");
    setSaving(true);
    await onSave({ quote: quote.trim(), author: author.trim() || null, breakdown: breakdown.trim() || null });
    setSaving(false);
  }
  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl border border-primary/40 p-3">
      <Textarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Quote" aria-label="Quote" autoFocus />
      <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" aria-label="Author" />
      <Textarea value={breakdown} onChange={(e) => setBreakdown(e.target.value)} placeholder="How to apply it (optional)" aria-label="How to apply it" />
      <FormButtons saving={saving} onCancel={onCancel} />
    </form>
  );
}

function WordForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SavedWord | null;
  onSave: (v: Omit<SavedWord, "id" | "created_at">) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [word, setWord] = useState(initial?.word ?? "");
  const [pos, setPos] = useState(initial?.part_of_speech ?? "");
  const [definition, setDefinition] = useState(initial?.definition ?? "");
  const [synonyms, setSynonyms] = useState((initial?.synonyms ?? []).join(", "));
  const [examples, setExamples] = useState((initial?.examples ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim()) return toast.error("Word can't be empty");
    setSaving(true);
    await onSave({
      word: word.trim(),
      part_of_speech: pos.trim() || null,
      definition: definition.trim() || null,
      synonyms: splitList(synonyms, /,/),
      examples: splitList(examples, /\n/),
    });
    setSaving(false);
  }
  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl border border-primary/40 p-3">
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Word" aria-label="Word" autoFocus />
        <Input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="Part of speech" aria-label="Part of speech" />
      </div>
      <Textarea value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="Definition" aria-label="Definition" />
      <Input value={synonyms} onChange={(e) => setSynonyms(e.target.value)} placeholder="Synonyms, comma separated" aria-label="Synonyms" />
      <Textarea value={examples} onChange={(e) => setExamples(e.target.value)} placeholder="Example sentences, one per line" aria-label="Examples" />
      <FormButtons saving={saving} onCancel={onCancel} />
    </form>
  );
}
