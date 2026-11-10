import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Play, Search } from "lucide-react";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/queries";
import { parseMedia, signMedia } from "@/lib/media";
import { formatDate } from "@/lib/dates";
import { signedUrls } from "@/lib/files";
import { ASSET_KINDS, assetKind, formatBytes, type AssetKind } from "@/lib/library";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { AssetGrid, type AssetView } from "@/components/library/asset-grid";
import { LibraryUploader } from "@/components/library/library-uploader";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Library" };


/**
 * Everything for one client in one place: the files people upload (product
 * photos, videos, logos, documents) and, on a second tab, every photo and video
 * used in the client's posts.
 */
export default async function LibraryPage({ params, searchParams }: PageProps<"/w/[slug]/library">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { workspace, can } = await getWorkspaceAccess(slug);
  const base = `/w/${workspace.slug}/library`;
  const tab = sp.tab === "posts" ? "posts" : "files";
  const type = (["photo", "video", "document"] as const).find((t) => t === sp.type) ?? null;
  const folder = typeof sp.folder === "string" ? sp.folder.slice(0, 60) : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const supabase = await createClient();

  // Folders and counts come from every file; the grid shows the filtered ones.
  const { data: everything } = await supabase.from("assets").select("folder, mime, size").eq("workspace_id", workspace.id);
  const all = everything ?? [];
  const folders = [...new Set(all.map((a) => a.folder))].sort((a, b) => a.localeCompare(b));
  const countOf = (kind: AssetKind) => all.filter((a) => assetKind(a.mime) === kind).length;
  const totalBytes = all.reduce((sum, a) => sum + Number(a.size || 0), 0);

  const href = (next: { tab?: string; type?: string | null; folder?: string; q?: string }) => {
    const params = new URLSearchParams();
    const merged = { tab, type, folder, q, ...next };
    if (merged.tab === "posts") params.set("tab", "posts");
    else {
      if (merged.type) params.set("type", merged.type);
      if (merged.folder) params.set("folder", merged.folder);
      if (merged.q) params.set("q", merged.q);
    }
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Library"
        description={`Product photos, videos, logos and documents for ${workspace.name}, all in one place.`}
        actions={can.uploadFiles && tab === "files" ? <LibraryUploader workspaceId={workspace.id} folders={folders} defaultFolder={folder || undefined} /> : null}
      />

      <nav className="flex gap-1 border-b border-line" aria-label="Library sections">
        {[
          { key: "files", label: "Files", count: all.length },
          { key: "posts", label: "From posts", count: null },
        ].map((t) => (
          <Link
            key={t.key}
            href={href({ tab: t.key, type: null, folder: "", q: "" })}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t.key ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== null ? <span className="ml-1.5 text-xs text-muted tabular-nums">{t.count}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "files" ? (
        <FilesTab
          workspaceId={workspace.id}
          clientName={workspace.name}
          isAdmin={can.manageWorkspace}
          canUpload={can.uploadFiles}
          type={type}
          folder={folder}
          q={q}
          folders={folders}
          counts={{ all: all.length, photo: countOf("photo"), video: countOf("video"), document: countOf("document") }}
          totalBytes={totalBytes}
          href={href}
        />
      ) : (
        <PostsTab workspaceId={workspace.id} slug={workspace.slug} isAgency={can.isAgency} />
      )}
    </div>
  );
}

async function FilesTab({
  workspaceId,
  clientName,
  isAdmin,
  canUpload,
  type,
  folder,
  q,
  folders,
  counts,
  totalBytes,
  href,
}: {
  workspaceId: string;
  clientName: string;
  isAdmin: boolean;
  canUpload: boolean;
  type: AssetKind | null;
  folder: string;
  q: string;
  folders: string[];
  counts: Record<"all" | AssetKind, number>;
  totalBytes: number;
  href: (next: { type?: string | null; folder?: string; q?: string }) => string;
}) {
  const supabase = await createClient();
  let query = supabase.from("assets").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(300);
  if (folder) query = query.eq("folder", folder);
  if (type === "photo") query = query.like("mime", "image/%");
  if (type === "video") query = query.like("mime", "video/%");
  if (type === "document") query = query.not("mime", "like", "image/%").not("mime", "like", "video/%");
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data: rows } = await query;
  const assets = rows ?? [];

  const [signed, people] = await Promise.all([
    signedUrls("workspace-files", assets.map((a) => a.path)),
    getPeople(assets.map((a) => a.uploaded_by)),
  ]);
  const urlFor = signed;
  const items: AssetView[] = assets
    .map((a) => ({
      id: a.id,
      name: a.name,
      folder: a.folder,
      kind: assetKind(a.mime),
      size: Number(a.size || 0),
      url: urlFor.get(a.path) ?? "",
      note: a.note,
      uploadedBy: a.uploaded_by ? (people.get(a.uploaded_by)?.name ?? "Former member") : "Former member",
      added: formatDate(a.created_at),
      // Renaming, moving and deleting is for agency admins only (also enforced in the database).
      canEdit: isAdmin,
    }))
    .filter((a) => a.url);

  const filtered = Boolean(type || folder || q);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="File type">
          {[{ key: null, label: "All", count: counts.all }, ...ASSET_KINDS.map((k) => ({ key: k.key, label: k.label, count: counts[k.key] }))].map((chip) => (
            <Link
              key={chip.label}
              href={href({ type: chip.key })}
              aria-current={type === chip.key ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition",
                type === chip.key ? "border-ink bg-ink text-white" : "border-line-strong text-ink-soft hover:bg-sunken",
              )}
            >
              {chip.label}
              <span className={cn("text-xs tabular-nums", type === chip.key ? "text-white/70" : "text-muted")}>{chip.count}</span>
            </Link>
          ))}
        </div>
        <form action="" method="get" className="relative w-full lg:w-72" role="search">
          {type ? <input type="hidden" name="type" value={type} /> : null}
          {folder ? <input type="hidden" name="folder" value={folder} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search file names" aria-label="Search file names" className="field pl-9" />
        </form>
      </div>

      {folders.length ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Folders">
          {["", ...folders].map((f) => (
            <Link
              key={f || "all"}
              href={href({ folder: f })}
              aria-current={folder === f ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-[13px] whitespace-nowrap transition",
                folder === f ? "bg-accent-soft font-medium text-accent-ink" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              {f || "All folders"}
            </Link>
          ))}
        </div>
      ) : null}

      {items.length ? (
        <>
          <AssetGrid items={items} folders={folders} zipName={`${clientName} library${folder ? ` - ${folder}` : ""}.zip`.replace(/[\/:*?"<>|]+/g, "-")} />
          <p className="text-xs text-muted">
            {filtered ? `${items.length} of ${counts.all} files` : `${counts.all} ${counts.all === 1 ? "file" : "files"}`} · {formatBytes(totalBytes)} in total
          </p>
        </>
      ) : (
        <Card>
          {filtered ? (
            <EmptyState
              title="Nothing matches"
              action={
                <Link href={href({ type: null, folder: "", q: "" })} className="text-sm font-medium text-accent-ink hover:underline">
                  Show all files
                </Link>
              }
            >
              Try another folder or search.
            </EmptyState>
          ) : (
            <EmptyState title="Nothing here yet">
              {canUpload
                ? "Upload product photos, videos, logos and documents, so everyone works from the same files."
                : "Files the team shares will appear here."}
            </EmptyState>
          )}
        </Card>
      )}
    </div>
  );
}

/** Every photo and video used in this client's posts, newest first, linking to each post. */
async function PostsTab({ workspaceId, slug, isAgency }: { workspaceId: string; slug: string; isAgency: boolean }) {
  const supabase = await createClient();
  const [{ data: posts }, { data: versions }] = await Promise.all([
    supabase.from("content_items").select("id, title, status, client_decision, planned_at").eq("workspace_id", workspaceId).order("planned_at", { ascending: false, nullsFirst: false }).limit(80),
    supabase.from("content_versions").select("content_item_id, version_number, media").eq("workspace_id", workspaceId).order("version_number", { ascending: false }),
  ]);
  // The latest version of each post that this person can see.
  const latest = new Map<string, unknown>();
  for (const v of versions ?? []) if (!latest.has(v.content_item_id)) latest.set(v.content_item_id, v.media);

  const entries = (posts ?? []).flatMap((post) => parseMedia(latest.get(post.id)).map((file) => ({ post, file })));
  const signed = await signMedia(entries.map((e) => e.file));
  const bySource = new Map(signed.map((s) => [s.path ?? s.url, s]));
  const tiles = entries
    .map(({ post, file }) => ({ post, media: bySource.get(file.path ?? file.url) }))
    .filter((t): t is { post: (typeof entries)[number]["post"]; media: NonNullable<typeof t.media> } => Boolean(t.media));

  if (!tiles.length) {
    return (
      <Card>
        <EmptyState title="No post media yet">
          {isAgency ? "Photos and videos uploaded to posts will show here." : "Photos and videos from posts shared with you will show here."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map(({ post, media }, i) => (
        <li key={`${post.id}-${i}`}>
          <Link
            href={`/w/${slug}/content/${post.id}`}
            className="group block overflow-hidden rounded-xl border border-line bg-surface transition hover:border-line-strong hover:shadow-sm"
          >
            {media.kind === "image" ? (
              <span className="block aspect-square overflow-hidden bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs */}
                <img src={media.src} alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              </span>
            ) : media.kind === "video" ? (
              <span className="relative block aspect-square overflow-hidden bg-ink">
                <video src={`${media.src}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                    <Play className="ml-0.5 size-4 fill-current" aria-hidden />
                  </span>
                </span>
              </span>
            ) : (
              <span className="flex aspect-square items-center justify-center bg-sunken text-muted">
                <FileText className="size-9" aria-hidden />
              </span>
            )}
            <span className="block space-y-1 px-3 py-2.5">
              <span className="block truncate text-[13px] font-medium text-ink">{post.title}</span>
              <StatusBadge item={post} side={isAgency ? "agency" : "client"} className="text-[11px]" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
