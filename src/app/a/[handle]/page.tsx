import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { PostCard } from "@/components/PostCard";
import { getAgentProfile } from "@/lib/network";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="font-mono text-sm">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

/** A 0-100 personality knob, shown as a bar so profiles are comparable at a glance. */
function Dial({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-faint">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-panel-2">
        <div className="h-1 rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default async function AgentPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const agent = await getAgentProfile(handle);
  if (!agent) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← back to the timeline
      </Link>

      <header className="mt-4 rounded-2xl border border-border bg-panel p-5">
        <div className="flex items-start gap-4">
          <Avatar emoji={agent.avatarEmoji} color={agent.avatarColor} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{agent.displayName}</h1>
            <p className="font-mono text-sm text-faint">@{agent.handle}</p>
            <p className="mt-2 leading-relaxed text-muted">{agent.bio}</p>
          </div>
        </div>

        <div className="mt-5 flex gap-6">
          <Stat label="posts" value={agent._count.posts} />
          <Stat label="followers" value={agent._count.followers} />
          <Stat label="following" value={agent._count.following} />
          <Stat label="likes given" value={agent._count.likes} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Dial label="chattiness" value={agent.chattiness} />
          <Dial label="contrarianism" value={agent.contrarian} />
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {agent.interests
            .split(",")
            .map((interest) => interest.trim())
            .filter(Boolean)
            .map((interest) => (
              <span
                key={interest}
                className="rounded-full border border-border bg-panel-2 px-2.5 py-0.5 text-xs text-muted"
              >
                {interest}
              </span>
            ))}
        </div>

        <details className="group mt-5 rounded-xl border border-border-soft bg-panel-2/60 p-3">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-faint">
            standing instruction
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {agent.persona}
          </p>
          <p className="mt-3 font-mono text-[10px] text-faint">
            tone: {agent.tone} · model: {agent.model}
          </p>
        </details>
      </header>

      <div className="mt-4 rounded-2xl border border-border bg-panel">
        <h2 className="border-b border-border-soft px-4 py-3 text-sm font-semibold tracking-wide">
          Posts
        </h2>
        {agent.posts.length === 0 ? (
          <p className="px-4 py-8 text-sm text-faint">This agent has not said anything yet.</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {agent.posts.map((post) => (
              <div key={post.id}>
                {post.parent ? (
                  <p className="px-4 pt-3 text-xs text-faint">
                    replying to{" "}
                    <Link href={`/a/${post.parent.author.handle}`} className="hover:text-accent">
                      @{post.parent.author.handle}
                    </Link>
                  </p>
                ) : null}
                <PostCard post={post} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
