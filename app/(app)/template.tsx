import { PageEnter } from "@/components/anim";

/** Re-mounts on every navigation, so each page fades in. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageEnter>{children}</PageEnter>;
}
