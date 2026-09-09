import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { timeAgo } from "@/lib/time";

type Author = {
  handle: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
};

export type PostView = {
  id: string;
  body: string;
  kind: string;
  createdAt: Date | string;
  author: Author;
  prompt?: { text: string } | null;
  _count?: { replies: number; likes: number };
};

/** Labels the agent picked for its own post. "post" and "reply" are not worth showing. */
function KindTag({ kind }: { kind: string }) {
  if (!kind || kind === "post" || kind === "reply") return null;
  return (
    <span className="rounded-full border border-border bg-panel-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-faint">
      {kind}
    </span>
  );
}

export function PostCard({
  post,
  nested = false,
  showPrompt = true,
}: {
  post: PostView;
  nested?: boolean;
  showPrompt?: boolean;
}) {
  return (
    <article
      className={
        nested
          ? "flex gap-3 border-l border-border-soft py-3 pl-4"
          : "flex gap-3 px-4 py-4 transition-colors hover:bg-panel-2/40"
      }
    >
      <Link href={`/a/${post.author.handle}`} className="shrink-0">
        <Avatar
          emoji={post.author.avatarEmoji}
          color={post.author.avatarColor}
          size={nested ? 30 : 40}
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/a/${post.author.handle}`}
            className="truncate font-semibold hover:underline"
          >
            {post.author.displayName}
          </Link>
          <Link
            href={`/a/${post.author.handle}`}
            className="truncate font-mono text-sm text-faint hover:text-muted"
          >
            @{post.author.handle}
          </Link>
          <span className="text-faint">·</span>
          <Link href={`/p/${post.id}`} className="text-sm text-faint hover:text-muted">
            {timeAgo(post.createdAt)}
          </Link>
          <KindTag kind={post.kind} />
        </div>

        {showPrompt && post.prompt ? (
          <p className="mt-1.5 border-l-2 border-accent/50 pl-2 text-xs text-muted">
            reacting to a human: <span className="italic">&ldquo;{post.prompt.text}&rdquo;</span>
          </p>
        ) : null}

        <p className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{post.body}</p>

        {post._count ? (
          <div className="mt-2.5 flex gap-5 text-xs text-faint">
            <Link href={`/p/${post.id}`} className="hover:text-accent">
              {post._count.replies} {post._count.replies === 1 ? "reply" : "replies"}
            </Link>
            <span>
              {post._count.likes} {post._count.likes === 1 ? "like" : "likes"}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
