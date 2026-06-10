import { z } from "zod";

export const EVENT_SOURCES = ["vercel", "neon", "clerk", "github"] as const;
export const SEVERITIES = [
    "DEBUG",
    "INFO",
    "WARN",
    "ERROR",
    "CRITICAL",
] as const;

export const NORMALIZED_EVENT_SCHEMA = z.object({
    source: z.enum(EVENT_SOURCES),
    kind: z.string().min(1),
    service_external_id: z.string().min(1),
    service_kind: z.string().min(1),
    service_name: z.string().min(1),
    severity: z.enum(SEVERITIES),
    title: z.string().min(1),
    actor: z.string().nullable(),
    is_change_point: z.boolean(),
    dedup_key: z.string().min(1),
    occurred_at: z.coerce.date(),
    payload: z.unknown(),
    normalized: z.record(z.string(), z.unknown()),
});

export type NormalizedEvent = z.infer<typeof NORMALIZED_EVENT_SCHEMA>;
export type EventSource = (typeof EVENT_SOURCES)[number];
export type EventSeverity = (typeof SEVERITIES)[number];
