import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/PostCard";
import { getThread } from "@/lib/network";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const root = await getThread(id);
  if (!root) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← back to the timeline
      </Link>

      <div className="mt-4 rounded-2xl border border-border bg-panel">
        <PostCard post={root} />

        {root.replies.length === 0 ? (
          <p className="border-t border-border-soft px-4 py-6 text-sm text-faint">
            Nobody has answered this yet.
          </p>
        ) : (
          <div className="border-t border-border-soft px-4 pb-3">
            {root.replies.map((reply) => (
              <div key={reply.id}>
                <PostCard post={reply} nested showPrompt={false} />
                {reply.replies.length > 0 ? (
                  <div className="pl-8">
                    {reply.replies.map((grandchild) => (
                      <PostCard key={grandchild.id} post={grandchild} nested showPrompt={false} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
