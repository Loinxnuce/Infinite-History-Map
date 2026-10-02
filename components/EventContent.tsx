"use client";

import { useMemo } from "react";

const RICH_TEXT_PREFIX = "<!--richtext-v1-->";
const LEGACY_IMAGE_LINE = /^!\[(.*?)\]\((https:\/\/[^)]+)\)$/i;

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeSafeUrl(value: string) {
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return "";
  return escapeAttribute(trimmed);
}

function sanitizeRichHtml(input: string) {
  let value = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select)[^>]*>[\s\S]*?<\/\1\s*>/gi,
      ""
    )
    .replace(
      /<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select)\b[^>]*\/?>/gi,
      ""
    );

  const allowed = new Set([
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "h2",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "figure",
    "img",
    "figcaption",
  ]);

  value = value.replace(
    /<\/?([a-z0-9-]+)\b[^>]*>/gi,
    (fullTag, rawTagName: string) => {
      const tagName = rawTagName.toLowerCase();
      const closing = /^<\//.test(fullTag);

      if (!allowed.has(tagName)) return "";

      if (closing) {
        if (tagName === "br" || tagName === "img") return "";
        return `</${tagName}>`;
      }

      if (tagName === "br") return "<br>";

      if (tagName === "img") {
        const srcMatch = fullTag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
        const altMatch = fullTag.match(/\balt\s*=\s*["']([^"']*)["']/i);
        const src = normalizeSafeUrl(srcMatch?.[1] ?? "");

        if (!src) return "";

        const alt = escapeAttribute(altMatch?.[1] ?? "Ảnh minh họa sự kiện");
        return `<img src="${src}" alt="${alt}" loading="lazy">`;
      }

      if (tagName === "a") {
        const hrefMatch = fullTag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
        const href = normalizeSafeUrl(hrefMatch?.[1] ?? "");

        if (!href) return "<span>";
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
      }

      return `<${tagName}>`;
    }
  );

  value = value.replace(/<span>([\s\S]*?)<\/a>/gi, "$1");
  return value;
}

function legacyContent(content: string) {
  return content.split("\n").map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <div key={`space-${index}`} className="content-space" />;
    }

    const imageMatch = trimmed.match(LEGACY_IMAGE_LINE);

    if (imageMatch) {
      return (
        <figure key={`image-${index}`} className="inline-event-image">
          <img
            src={imageMatch[2].trim()}
            alt={imageMatch[1].trim() || "Ảnh minh họa sự kiện"}
            loading="lazy"
          />
          {imageMatch[1].trim() && (
            <figcaption>{imageMatch[1].trim()}</figcaption>
          )}
        </figure>
      );
    }

    return <p key={`text-${index}`}>{line}</p>;
  });
}

export default function EventContent({
  content,
}: {
  content: string | null | undefined;
}) {
  const richHtml = useMemo(() => {
    if (!content?.startsWith(RICH_TEXT_PREFIX)) return null;
    return sanitizeRichHtml(content.slice(RICH_TEXT_PREFIX.length));
  }, [content]);

  if (!content?.trim()) {
    return <p className="empty-content">Sự kiện này chưa có nội dung.</p>;
  }

  if (richHtml !== null) {
    return (
      <div
        className="rich-event-content"
        dangerouslySetInnerHTML={{ __html: richHtml }}
      />
    );
  }

  return <>{legacyContent(content)}</>;
}
