import { PageSkeleton } from "@/components/ui";
import { SlowHint } from "@/components/slow-hint";

export default function Loading() {
  return (
    <>
      <PageSkeleton />
      <SlowHint />
    </>
  );
}
