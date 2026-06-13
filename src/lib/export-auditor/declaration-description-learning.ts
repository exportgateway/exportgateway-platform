import type { DeclarationLanguage } from "@/lib/export-auditor/types";

export interface UserEditedDescriptionEntry {
  hsCode: string;
  originalDescription: string;
  userDescription: string;
  language: DeclarationLanguage;
  source: "user_edited";
  savedAt: string;
}

export interface ApprovedDescriptionEntry {
  hsCode: string;
  language: DeclarationLanguage;
  approvedDescription: string;
  usageCount: number;
  lastUsedAt: string;
}

export interface DeclarationDescriptionLearningStore {
  getUserEditedDescription(hsCode: string, language: DeclarationLanguage): string | null;
  saveUserEditedDescription(
    hsCode: string,
    originalDescription: string,
    userDescription: string,
    language: DeclarationLanguage
  ): void;
  getPreferredDescriptionForHs(hsCode: string, language: DeclarationLanguage): string | null;
  recordApprovedDescriptionUsage(
    hsCode: string,
    language: DeclarationLanguage,
    description: string
  ): void;
  getApprovedUsageCount(
    hsCode: string,
    language: DeclarationLanguage,
    description: string
  ): number;
}

function normalizeHsCode(hsCode: string): string {
  return hsCode.replace(/\D/g, "");
}

function userEditKey(hsCode: string, language: DeclarationLanguage): string {
  return `${normalizeHsCode(hsCode)}:${language}`;
}

function approvedKey(
  hsCode: string,
  language: DeclarationLanguage,
  description: string
): string {
  return `${normalizeHsCode(hsCode)}:${language}:${description.trim().toLowerCase()}`;
}

/** In-memory learning store for tests and lightweight environments. */
export class InMemoryDeclarationDescriptionLearningStore
  implements DeclarationDescriptionLearningStore
{
  protected readonly userEdits = new Map<string, UserEditedDescriptionEntry>();
  protected readonly approved = new Map<string, ApprovedDescriptionEntry>();

  getUserEditedDescription(hsCode: string, language: DeclarationLanguage): string | null {
    return this.userEdits.get(userEditKey(hsCode, language))?.userDescription ?? null;
  }

  saveUserEditedDescription(
    hsCode: string,
    originalDescription: string,
    userDescription: string,
    language: DeclarationLanguage
  ): void {
    const trimmed = userDescription.trim();
    if (!trimmed) return;

    this.userEdits.set(userEditKey(hsCode, language), {
      hsCode: normalizeHsCode(hsCode),
      originalDescription,
      userDescription: trimmed,
      language,
      source: "user_edited",
      savedAt: new Date().toISOString(),
    });
    this.recordApprovedDescriptionUsage(hsCode, language, trimmed);
  }

  getPreferredDescriptionForHs(hsCode: string, language: DeclarationLanguage): string | null {
    const prefix = `${normalizeHsCode(hsCode)}:${language}:`;
    let best: ApprovedDescriptionEntry | null = null;

    for (const [key, entry] of this.approved) {
      if (!key.startsWith(prefix)) continue;
      if (!best || entry.usageCount > best.usageCount) {
        best = entry;
      } else if (
        best &&
        entry.usageCount === best.usageCount &&
        entry.lastUsedAt > best.lastUsedAt
      ) {
        best = entry;
      }
    }

    return best?.approvedDescription ?? null;
  }

  recordApprovedDescriptionUsage(
    hsCode: string,
    language: DeclarationLanguage,
    description: string
  ): void {
    const trimmed = description.trim();
    if (!trimmed) return;

    const key = approvedKey(hsCode, language, trimmed);
    const existing = this.approved.get(key);
    const now = new Date().toISOString();

    this.approved.set(key, {
      hsCode: normalizeHsCode(hsCode),
      language,
      approvedDescription: trimmed,
      usageCount: (existing?.usageCount ?? 0) + 1,
      lastUsedAt: now,
    });
  }

  getApprovedUsageCount(
    hsCode: string,
    language: DeclarationLanguage,
    description: string
  ): number {
    return (
      this.approved.get(approvedKey(hsCode, language, description))?.usageCount ?? 0
    );
  }
}

/** JSON file persistence alongside declaration description cache. */
export class JsonFileDeclarationDescriptionLearningStore
  extends InMemoryDeclarationDescriptionLearningStore
{
  private readonly filePath: string;

  constructor(filePath = "data/declaration-description-learning.json") {
    super();
    this.filePath = filePath;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const { readFileSync, existsSync } = require("fs") as typeof import("fs");
      if (!existsSync(this.filePath)) return;
      const raw = readFileSync(this.filePath, "utf8");
      const payload = JSON.parse(raw) as {
        userEdits?: UserEditedDescriptionEntry[];
        approved?: ApprovedDescriptionEntry[];
      };

      for (const entry of payload.userEdits ?? []) {
        this.userEdits.set(userEditKey(entry.hsCode, entry.language), entry);
      }
      for (const entry of payload.approved ?? []) {
        this.approved.set(
          approvedKey(entry.hsCode, entry.language, entry.approvedDescription),
          entry
        );
      }
    } catch {
      // ignore read failures
    }
  }

  private persist(): void {
    try {
      const { writeFileSync, mkdirSync } = require("fs") as typeof import("fs");
      const { dirname } = require("path") as typeof import("path");
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(
        this.filePath,
        JSON.stringify(
          {
            userEdits: [...this.userEdits.values()],
            approved: [...this.approved.values()],
          },
          null,
          2
        ),
        "utf8"
      );
    } catch {
      // ignore write failures
    }
  }

  override saveUserEditedDescription(
    hsCode: string,
    originalDescription: string,
    userDescription: string,
    language: DeclarationLanguage
  ): void {
    super.saveUserEditedDescription(hsCode, originalDescription, userDescription, language);
    this.persist();
  }

  override recordApprovedDescriptionUsage(
    hsCode: string,
    language: DeclarationLanguage,
    description: string
  ): void {
    super.recordApprovedDescriptionUsage(hsCode, language, description);
    this.persist();
  }
}

let defaultLearningStore: DeclarationDescriptionLearningStore | null = null;

export function getDeclarationDescriptionLearningStore(): DeclarationDescriptionLearningStore {
  if (defaultLearningStore) return defaultLearningStore;
  defaultLearningStore = new JsonFileDeclarationDescriptionLearningStore();
  return defaultLearningStore;
}

export function setDeclarationDescriptionLearningStore(
  store: DeclarationDescriptionLearningStore | null
): void {
  defaultLearningStore = store;
}

export function saveUserEditedDescription(
  hsCode: string,
  originalDescription: string,
  userDescription: string,
  language: DeclarationLanguage,
  store: DeclarationDescriptionLearningStore = getDeclarationDescriptionLearningStore()
): void {
  store.saveUserEditedDescription(hsCode, originalDescription, userDescription, language);
}

export function recordApprovedDescriptionUsage(
  hsCode: string,
  language: DeclarationLanguage,
  description: string,
  store: DeclarationDescriptionLearningStore = getDeclarationDescriptionLearningStore()
): void {
  store.recordApprovedDescriptionUsage(hsCode, language, description);
}

export function getPreferredDescriptionForHs(
  hsCode: string,
  language: DeclarationLanguage,
  store: DeclarationDescriptionLearningStore = getDeclarationDescriptionLearningStore()
): string | null {
  return store.getPreferredDescriptionForHs(hsCode, language);
}
