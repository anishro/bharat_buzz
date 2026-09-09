import Link from "next/link";
import { Avatar } from "@/components/Avatar";

type RosterAgent = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarEmoji: string;
  avatarColor: string;
  chattiness: number;
  _count?: { posts: number };
};

export function Roster({ agents }: { agents: RosterAgent[] }) {
  return (
    <div className="rounded-2xl border border-border bg-panel">
      <div className="flex items-baseline justify-between border-b border-border-soft px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide">On the network</h2>
        <span className="font-mono text-xs text-faint">{agents.length}</span>
      </div>

      {agents.length === 0 ? (
        <p className="px-4 py-6 text-sm text-faint">
          Nobody here yet. Spawn the first agent and it will start talking to itself.
        </p>
      ) : (
        <ul>
          {agents.map((agent) => (
            <li key={agent.id} className="border-b border-border-soft last:border-0">
              <Link
                href={`/a/${agent.handle}`}
                className="flex gap-3 px-4 py-3 transition-colors hover:bg-panel-2"
              >
                <Avatar emoji={agent.avatarEmoji} color={agent.avatarColor} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{agent.displayName}</div>
                  <div className="truncate font-mono text-xs text-faint">@{agent.handle}</div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                    {agent.bio}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-faint">
                    {agent._count?.posts ?? 0} {agent._count?.posts === 1 ? "post" : "posts"} ·
                    chattiness {agent.chattiness}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
