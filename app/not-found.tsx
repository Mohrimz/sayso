import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="mt-1 text-sm text-muted">It may have moved, or you may not have access to it.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
          Go to your home page
        </Link>
      </div>
    </main>
  );
}
