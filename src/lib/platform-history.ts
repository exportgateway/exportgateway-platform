export type HistoryTool = "freight" | "intrastat";

export interface PlatformHistoryEntry {
  id: string;
  tool: HistoryTool;
  route: string;
  summary: string;
  timestamp: number;
  href: string;
}

const STORAGE_KEY = "exportgateway-platform-history";
const MAX_ENTRIES = 20;

function readEntries(): PlatformHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlatformHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: PlatformHistoryEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function getPlatformHistory(): PlatformHistoryEntry[] {
  return readEntries().sort((a, b) => b.timestamp - a.timestamp);
}

export function addPlatformHistoryEntry(
  entry: Omit<PlatformHistoryEntry, "id" | "timestamp">
): PlatformHistoryEntry {
  const newEntry: PlatformHistoryEntry = {
    ...entry,
    id: `${entry.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };

  const existing = readEntries().filter(
    (e) => !(e.tool === newEntry.tool && e.route === newEntry.route && e.summary === newEntry.summary)
  );
  writeEntries([newEntry, ...existing]);
  return newEntry;
}

export function clearPlatformHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getPlatformStats() {
  const entries = getPlatformHistory();
  const freightCount = entries.filter((e) => e.tool === "freight").length;
  const intrastatCount = entries.filter((e) => e.tool === "intrastat").length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = entries.filter((e) => e.timestamp >= weekAgo).length;

  return {
    total: entries.length,
    freightCount,
    intrastatCount,
    thisWeek,
  };
}
