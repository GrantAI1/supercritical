import Link from "next/link";
import { EventTape } from "@/components/terminal/event-tape";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end text-xs">
        <Link
          href="/dashboard/settings/connections"
          className="text-terminal-dim hover:text-terminal-amber"
        >
          [SETTINGS → CONNECTIONS]
        </Link>
      </div>
      <EventTape />
    </div>
  );
}
