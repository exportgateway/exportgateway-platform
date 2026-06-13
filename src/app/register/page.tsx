import { redirect } from "next/navigation";

export default async function RegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const plan = params.plan ? `?plan=${params.plan}` : "";
  redirect(`/early-access${plan}`);
}
