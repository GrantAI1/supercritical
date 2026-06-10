"use client";

import { useFormState } from "react-dom";
import { createConnection, type CreateConnectionState } from "./actions";

const INITIAL_STATE: CreateConnectionState = { ok: false };

export function NewConnectionForm() {
    const [state, formAction] = useFormState(createConnection, INITIAL_STATE);

    return (
        <form
            action={formAction}
            className="flex max-w-xl flex-col gap-3 border border-terminal-grid p-4 text-xs"
        >
            <span className="tracking-[0.2em] text-terminal-amber">
                ADD CONNECTION
            </span>
            <label className="flex flex-col gap-1">
                <span className="text-terminal-dim">PROVIDER</span>
                <select
                    name="provider"
                    className="border border-terminal-grid bg-terminal-bg p-1 outline-none focus:border-terminal-amber"
                >
                    <option value="GITHUB">GITHUB</option>
                    <option value="VERCEL">VERCEL</option>
                </select>
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-terminal-dim">
                    ACCOUNT ID (GitHub: owner/org login · Vercel: team_xxx or
                    user id)
                </span>
                <input
                    name="externalAccountId"
                    className="border border-terminal-grid bg-terminal-bg p-1 outline-none focus:border-terminal-amber"
                    placeholder="acme"
                    autoComplete="off"
                />
            </label>
            <button
                type="submit"
                className="self-start border border-terminal-amber px-3 py-1 text-terminal-amber transition-colors hover:bg-terminal-amber hover:text-black"
            >
                CREATE
            </button>
            {state.error && (
                <p className="text-terminal-red">ERR: {state.error}</p>
            )}
            {state.ok && state.secret && (
                <div className="border border-terminal-green p-2 text-terminal-green">
                    <p className="tracking-[0.15em]">
                        SECRET — SHOWN ONCE. CONFIGURE IT ON THE PROVIDER NOW.
                    </p>
                    <p className="mt-1 break-all select-all">{state.secret}</p>
                    <p className="mt-2 text-terminal-dim">
                        webhook URL: &lt;your-deployment&gt;{state.webhook_path}
                    </p>
                </div>
            )}
        </form>
    );
}
