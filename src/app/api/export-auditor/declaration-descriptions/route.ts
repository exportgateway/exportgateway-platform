import { NextResponse } from "next/server";
import {
  generateDeclarationDescriptionsBatch,
  type BatchDeclarationDescriptionRequest,
} from "@/lib/export-auditor/declaration-description-engine";
import { getServerDeclarationDescriptionCache } from "@/lib/export-auditor/declaration-description-cache.server";
import type { DeclarationLanguage } from "@/lib/export-auditor/types";

const SUPPORTED_LANGUAGES = new Set<DeclarationLanguage>(["en", "si", "hr", "sr", "de"]);

function isDeclarationLanguage(value: string): value is DeclarationLanguage {
  return SUPPORTED_LANGUAGES.has(value as DeclarationLanguage);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      descriptions?: string[];
      languages?: string[];
      items?: Array<{ original?: string; description?: string; hsCode?: string }>;
    };

    const languages = (Array.isArray(body.languages) ? body.languages : ["en"]).filter(
      isDeclarationLanguage
    );

    if (languages.length === 0) {
      return NextResponse.json({ error: "No supported languages provided." }, { status: 400 });
    }

    const requests: BatchDeclarationDescriptionRequest[] = [];

    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const language of languages) {
        for (const item of body.items) {
          const original = item.original ?? item.description ?? "";
          if (!original.trim()) continue;
          requests.push({
            original,
            language,
            hsCode: item.hsCode,
          });
        }
      }
    } else {
      const descriptions = Array.isArray(body.descriptions) ? body.descriptions : [];
      for (const language of languages) {
        for (const original of descriptions) {
          requests.push({ original, language });
        }
      }
    }

    if (requests.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = await generateDeclarationDescriptionsBatch(requests, {
      cache: getServerDeclarationDescriptionCache(),
    });
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Declaration description failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
