import { LoginCard } from "./login-card";

// Read on the server so the card renders on first paint: useSearchParams in a
// client page would need a Suspense boundary that prerenders as blank.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;
  return (
    <LoginCard
      next={typeof next === "string" ? next : null}
      error={typeof error === "string" ? error : null}
    />
  );
}
