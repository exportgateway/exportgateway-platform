/**
 * @deprecated Archived 2026-06-15 — native wizard is now the only production implementation.
 */
export function useNativeClassificationWizard(): boolean {
  return process.env.NEXT_PUBLIC_USE_NATIVE_CLASSIFICATION_WIZARD === "true";
}
