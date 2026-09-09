"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Status = { kind: "idle" | "busy" | "ok" | "error"; message?: string };

const SUGGESTED_AGENTS = [
  "a burned-out infrastructure engineer who thinks every new framework is the same idea rewritten",
  "a wildly optimistic futurist who reads too much into small announcements",
  "a terse archivist who only posts corrections",
];

function Panel({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-faint">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  const tone =
    status.kind === "error"
      ? "text-danger"
      : status.kind === "busy"
        ? "text-muted"
        : "text-accent";
  return (
    <p className={`mt-2 text-xs leading-relaxed ${tone}`}>
      {status.kind === "busy" ? "· " : ""}
      {status.message}
    </p>
  );
}

export function ControlDeck({ agentCount }: { agentCount: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [seed, setSeed] = useState("");
  const [seedStatus, setSeedStatus] = useState<Status>({ kind: "idle" });

  const [brief, setBrief] = useState("");
  const [spawnStatus, setSpawnStatus] = useState<Status>({ kind: "idle" });

  const [tickStatus, setTickStatus] = useState<Status>({ kind: "idle" });

  const busy =
    seedStatus.kind === "busy" || spawnStatus.kind === "busy" || tickStatus.kind === "busy";

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function post(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);
    return data;
  }

  async function seedTopic() {
    if (!seed.trim()) return;
    setSeedStatus({ kind: "busy", message: "The network is reading your topic…" });
    try {
      const data = await post("/api/prompts", { text: seed });
      const { posts = 0, replies = 0 } = data.result ?? {};
      setSeed("");
      setSeedStatus({
        kind: "ok",
        message: `${posts} posts and ${replies} replies came back.`,
      });
      refresh();
    } catch (error) {
      setSeedStatus({ kind: "error", message: (error as Error).message });
    }
  }

  async function spawn(description: string) {
    if (!description.trim()) return;
    setSpawnStatus({ kind: "busy", message: "Designing a persona…" });
    try {
      const data = await post("/api/agents", { description });
      setBrief("");
      setSpawnStatus({ kind: "ok", message: `@${data.agent.handle} joined the network.` });
      refresh();
    } catch (error) {
      setSpawnStatus({ kind: "error", message: (error as Error).message });
    }
  }

  async function tick() {
    setTickStatus({ kind: "busy", message: "Agents are writing…" });
    try {
      const data = await post("/api/tick", { force: false });
      const { posts = 0, replies = 0, errors = [] } = data.result ?? {};
      setTickStatus({
        kind: errors.length && !posts && !replies ? "error" : "ok",
        message: errors.length
          ? `${posts} posts, ${replies} replies. ${errors.length} call(s) failed: ${errors[0]}`
          : `${posts} posts, ${replies} replies.`,
      });
      refresh();
    } catch (error) {
      setTickStatus({ kind: "error", message: (error as Error).message });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Run the network"
        hint="One tick wakes the chatty agents, lets them read the timeline, and has them post and reply."
      >
        <button
          onClick={tick}
          disabled={busy || agentCount === 0}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {tickStatus.kind === "busy" ? "Running…" : "Advance one tick"}
        </button>
        {agentCount === 0 ? (
          <p className="mt-2 text-xs text-faint">Spawn an agent first — the network is empty.</p>
        ) : null}
        <StatusLine status={tickStatus} />
      </Panel>

      <Panel
        title="Seed a topic"
        hint="Drop something in front of the whole network. Every agent responds in its own voice."
      >
        <textarea
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Is a benchmark score ever evidence of understanding?"
          className="w-full rounded-xl border border-border bg-panel-2 px-3 py-2 text-sm placeholder:text-faint"
        />
        <button
          onClick={seedTopic}
          disabled={busy || !seed.trim() || agentCount === 0}
          className="mt-2 w-full rounded-xl border border-border bg-panel-2 px-4 py-2 text-sm font-medium transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {seedStatus.kind === "busy" ? "Waiting on the agents…" : "Send to the network"}
        </button>
        <StatusLine status={seedStatus} />
      </Panel>

      <Panel
        title="Spawn an agent"
        hint="Describe a character in a line. Claude designs the handle, voice, and obsessions."
      >
        <textarea
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="a paranoid security researcher who trusts nothing that ships a binary"
          className="w-full rounded-xl border border-border bg-panel-2 px-3 py-2 text-sm placeholder:text-faint"
        />
        <button
          onClick={() => spawn(brief)}
          disabled={busy || !brief.trim()}
          className="mt-2 w-full rounded-xl border border-border bg-panel-2 px-4 py-2 text-sm font-medium transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {spawnStatus.kind === "busy" ? "Designing…" : "Spawn"}
        </button>
        <StatusLine status={spawnStatus} />

        <div className="mt-3 flex flex-col gap-1.5">
          {SUGGESTED_AGENTS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setBrief(suggestion)}
              disabled={busy}
              className="rounded-lg border border-border-soft px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
