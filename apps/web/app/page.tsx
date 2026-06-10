import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl tracking-[0.3em] text-terminal-amber">SUPERCRITICAL</h1>
      <p className="max-w-xl text-center text-sm text-terminal-dim">
        Vercel knows your deploys. Neon knows your queries. Clerk knows your auth.
        GitHub knows your code. Nothing connects them. This does.
      </p>
      <div className="flex gap-4 text-sm">
        <Link
          href="/dashboard"
          className="border border-terminal-amber px-4 py-2 text-terminal-amber hover:bg-terminal-amber hover:text-black"
        >
          ENTER TERMINAL
        </Link>
        <Link
          href="/sign-in"
          className="border border-terminal-grid px-4 py-2 text-terminal-dim hover:text-neutral-200"
        >
          SIGN IN
        </Link>
      </div>
    </main>
  );
}
