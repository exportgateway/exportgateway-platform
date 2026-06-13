import { NextResponse } from "next/server";
import { getDeclarationDescriptionEngineHealth } from "@/lib/export-auditor/declaration-description-health";

export async function GET() {
  const health = getDeclarationDescriptionEngineHealth();
  return NextResponse.json(health);
}
