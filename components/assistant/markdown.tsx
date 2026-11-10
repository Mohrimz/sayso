import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A small, safe renderer for the subset of Markdown the assistant writes:
 * paragraphs, bullet and numbered lists, bold lines as headings, **bold**,
 * `code` and [links](/path). Raw HTML is never rendered.
 */

type ListItem = { text: string; nested: boolean };
type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "ul" | "ol"; items: ListItem[] }
  | { kind: "hr" };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    const nested = raw.length - raw.trimStart().length >= 2;
    let m: RegExpExecArray | null;

    if ((m = /^#{1,6}\s+(.*)$/.exec(line))) {
      blocks.push({ kind: "heading", text: m[1] });
      current = null;
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      blocks.push({ kind: "hr" });
      current = null;
    } else if ((m = /^[-*•]\s+(.*)$/.exec(line)) || (m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      const kind = /^\d/.test(line) ? "ol" : "ul";
      if (current && (current.kind === "ul" || current.kind === "ol") && (current.kind === kind || nested)) {
        current.items.push({ text: m[1], nested });
      } else {
        current = { kind, items: [{ text: m[1], nested: false }] };
        blocks.push(current);
      }
    } else if (current && (current.kind === "ul" || current.kind === "ol")) {
      // A wrapped line continues the previous list item.
      current.items[current.items.length - 1].text += ` ${line}`;
    } else if (current?.kind === "p") {
      current.lines.push(line);
    } else {
      current = { kind: "p", lines: [line] };
      blocks.push(current);
    }
  }
  return blocks;
}

const linkClass = "font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent";

function inline(text: string, keyPrefix = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![*\w])[*_](?![\s*_])([^*_\n]+?)[*_](?![*\w])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}${i++}`;
    if (match[1] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-ink">
          {inline(match[1], `${key}-`)}
        </strong>,
      );
    } else if (match[5] !== undefined) {
      out.push(
        <em key={key} className="italic">
          {match[5]}
        </em>,
      );
    } else if (match[2] !== undefined) {
      out.push(
        <code key={key} className="rounded bg-sunken px-1 py-0.5 text-[0.9em]">
          {match[2]}
        </code>,
      );
    } else {
      const [label, href] = [match[3], match[4]];
      if (href.startsWith("/") && !href.startsWith("//")) {
        out.push(
          <Link key={key} href={href} className={linkClass}>
            {inline(label, `${key}-`)}
          </Link>,
        );
      } else if (/^https?:\/\//i.test(href)) {
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {inline(label, `${key}-`)}
          </a>,
        );
      } else {
        out.push(label);
      }
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2.5">
      {parse(text).map((block, i) => {
        switch (block.kind) {
          case "heading":
            return (
              <p key={i} className="pt-1 font-semibold text-ink">
                {inline(block.text.replace(/^\*\*(.*)\*\*$/, "$1"))}
              </p>
            );
          case "hr":
            return <hr key={i} className="border-line" />;
          case "p":
            return <p key={i}>{inline(block.lines.join(" "))}</p>;
          case "ul":
          case "ol": {
            const List = block.kind;
            return (
              <List key={i} className={List === "ol" ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5 marker:text-faint"}>
                {block.items.map((item, j) => (
                  <li key={j} className={item.nested ? "ml-4 list-[circle]" : undefined}>
                    {inline(item.text)}
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
