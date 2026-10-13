import { assetCatalogue } from "./assets";

export const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

/** 拒绝可执行 URL：只允许 http/https/mailto、页内 hash 与相对路径。 */
export function isSafeUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (/^[#/]/.test(value)) return true;
  if (/^(javascript|data|vbscript|file|blob):/i.test(value)) return false;
  try {
    const parsed = new URL(value, "https://example.invalid");
    return SAFE_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function isCatalogueImage(url: string): boolean {
  return assetCatalogue.some((asset) => asset.url === url);
}

export interface InlineSegment {
  kind: "text" | "strong" | "code" | "link" | "image";
  text: string;
  url?: string;
  safe?: boolean;
}

export type MarkdownBlock =
  | { kind: "heading"; level: 2 | 3; segments: InlineSegment[] }
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "list"; items: InlineSegment[][]; ordered: boolean }
  | { kind: "quote"; segments: InlineSegment[] }
  | { kind: "image"; url: string; alt: string; safe: boolean }
  | { kind: "raw"; text: string };

const tokenPattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ kind: "text", text: text.slice(lastIndex, index) });
    if (match[1] !== undefined || (match[2] !== undefined && match[0].startsWith("!["))) {
      segments.push({ kind: "image", text: match[1] ?? "", url: match[2], safe: isSafeUrl(match[2] ?? "") });
    } else if (match[3] !== undefined) {
      segments.push({ kind: "link", text: match[3], url: match[4], safe: isSafeUrl(match[4] ?? "") });
    } else if (match[5] !== undefined) {
      segments.push({ kind: "strong", text: match[5] });
    } else if (match[6] !== undefined) {
      segments.push({ kind: "code", text: match[6] });
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ kind: "text", text: text.slice(lastIndex) });
  return segments.length ? segments : [{ kind: "text", text: "" }];
}

/**
 * 轻量安全解析：原始 HTML 转为纯文本块，不生成可执行节点；
 * 图片与链接保留安全标记，危险 URL 由渲染层显示为文字。
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let ordered = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", segments: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      blocks.push({ kind: "list", items: listItems.map((item) => parseInline(item)), ordered });
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(Math.max(heading[1].length, 2), 3) as 2 | 3;
      blocks.push({ kind: "heading", level, segments: parseInline(heading[2]) });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "quote", segments: parseInline(quote[1]) });
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushParagraph();
      const nextOrdered = Boolean(numbered);
      if (listItems.length && ordered !== nextOrdered) flushList();
      ordered = nextOrdered;
      listItems.push((bullet?.[1] ?? numbered?.[1]) as string);
      continue;
    }
    if (/^<[^>]+>/.test(trimmed) || /<\/?[a-z][\s\S]*>/i.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "raw", text: trimmed });
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** 正文中的图片引用必须来自随包素材清单。 */
export function extractImageUrls(source: string): string[] {
  const urls: string[] = [];
  for (const match of source.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) urls.push(match[1]);
  return urls;
}

export function findUnsafeUrls(source: string): string[] {
  const unsafe: string[] = [];
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const url = match[1];
    if (isCatalogueImage(url)) continue;
    if (!isSafeUrl(url)) unsafe.push(url);
  }
  return unsafe;
}
