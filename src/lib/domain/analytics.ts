import { listLedger } from "@/lib/domain/repo";
import type { LedgerEntry } from "@/lib/domain/types";

/**
 * Spending as history, not as a gate.
 *
 * The budget figure is a planning number the owner may set or remove. Nothing in
 * dispatch consults it, so this module only answers questions about what was
 * already recorded: how much per day, per category, and which entries dominate.
 * Superseded reservations are skipped so a settled run is not counted twice.
 */
export interface SpendDay {
  date: string;
  label: string;
  cents: number;
  entries: number;
}

export interface SpendSlice {
  key: string;
  cents: number;
  entries: number;
  share: number;
}

export interface SpendAnalytics {
  days: SpendDay[];
  byCategory: SpendSlice[];
  byKind: SpendSlice[];
  totalCents: number;
  entries: number;
  peakDay: SpendDay | null;
  averagePerDayCents: number;
  top: LedgerEntry[];
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function spendAnalytics(companyId: string, dayCount = 14): SpendAnalytics {
  const window = Math.max(1, Math.min(90, Math.round(dayCount)));
  const entries = listLedger(companyId, 500).filter((entry) => !entry.supersededBy);

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (window - 1));

  const buckets = new Map<string, SpendDay>();
  for (let index = 0; index < window; index += 1) {
    const day = new Date(start.getTime() + index * 86_400_000);
    const key = day.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      label: day.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
      cents: 0,
      entries: 0,
    });
  }

  const inWindow = entries.filter((entry) => Date.parse(entry.createdAt) >= start.getTime());
  for (const entry of inWindow) {
    const bucket = buckets.get(dayKey(entry.createdAt));
    if (!bucket) continue;
    bucket.cents += entry.amountCents;
    bucket.entries += 1;
  }

  const days = [...buckets.values()];
  const totalCents = inWindow.reduce((sum, entry) => sum + entry.amountCents, 0);
  const group = (keyOf: (entry: LedgerEntry) => string): SpendSlice[] => {
    const map = new Map<string, SpendSlice>();
    for (const entry of inWindow) {
      const key = keyOf(entry);
      const slice = map.get(key) ?? { key, cents: 0, entries: 0, share: 0 };
      slice.cents += entry.amountCents;
      slice.entries += 1;
      map.set(key, slice);
    }
    return [...map.values()]
      .map((slice) => ({ ...slice, share: totalCents > 0 ? slice.cents / totalCents : 0 }))
      .sort((a, b) => b.cents - a.cents);
  };

  return {
    days,
    byCategory: group((entry) => entry.category),
    byKind: group((entry) => entry.kind),
    totalCents,
    entries: inWindow.length,
    peakDay: days.reduce<SpendDay | null>((best, day) => (!best || day.cents > best.cents ? day : best), null),
    averagePerDayCents: Math.round(totalCents / window),
    top: [...inWindow].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5),
  };
}

/** Money is displayed in dollars; the ledger stores whole cents. */
export function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
