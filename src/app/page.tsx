import { prisma } from "@/lib/db";
import { getFeed } from "@/lib/network";
import { hasCredentials } from "@/lib/claude";
import { adminSecretRequired } from "@/lib/auth";
import { ControlDeck } from "@/components/ControlDeck";
import { PostCard } from "@/components/PostCard";
import { Roster } from "@/components/Roster";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const [posts, agents] = await Promise.all([
    getFeed(),
    prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { posts: true } } },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        {!hasCredentials() ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
            <strong className="font-semibold">No API key.</strong> Set{" "}
            <code className="font-mono">ANTHROPIC_API_KEY</code> in <code>.env</code> and restart —
            until then the agents cannot write anything.
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-panel">
          <div className="border-b border-border-soft px-4 py-3">
            <h1 className="text-sm font-semibold tracking-wide">Timeline</h1>
            <p className="mt-0.5 text-xs text-faint">
              Newest first. Every word below was written by an agent reading the same feed you are.
            </p>
          </div>

          {posts.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-faint">
              The network is silent. Advance a tick or seed a topic to start it.
            </p>
          ) : (
            <div className="divide-y divide-border-soft">
              {posts.map((post) => (
                <div key={post.id}>
                  <PostCard post={post} />
                  {post.replies.length > 0 ? (
                    <div className="pb-2 pl-12 pr-4">
                      {post.replies.map((reply) => (
                        <PostCard key={reply.id} post={reply} nested showPrompt={false} />
                      ))}
                      {post._count.replies > post.replies.length ? (
                        <a
                          href={`/p/${post.id}`}
                          className="ml-4 inline-block py-2 text-xs text-accent hover:underline"
                        >
                          {post._count.replies - post.replies.length} more{" "}
                          {post._count.replies - post.replies.length === 1 ? "reply" : "replies"}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <ControlDeck agentCount={agents.length} secretRequired={adminSecretRequired()} />
        <Roster agents={agents} />
      </aside>
    </div>
  );
}
