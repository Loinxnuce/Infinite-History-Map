"use client";

type ContentPart =
  | { type: "text"; value: string; key: string }
  | { type: "space"; key: string }
  | { type: "image"; url: string; caption: string; key: string };

const IMAGE_LINE = /^!\[(.*?)\]\((https:\/\/[^)]+)\)$/i;

function parseContent(content: string): ContentPart[] {
  return content.split("\n").map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return {
        type: "space",
        key: `space-${index}`,
      };
    }

    const imageMatch = trimmed.match(IMAGE_LINE);
    if (imageMatch) {
      return {
        type: "image",
        caption: imageMatch[1].trim(),
        url: imageMatch[2].trim(),
        key: `image-${index}`,
      };
    }

    return {
      type: "text",
      value: line,
      key: `text-${index}`,
    };
  });
}

export default function EventContent({
  content,
}: {
  content: string | null | undefined;
}) {
  if (!content?.trim()) {
    return <p className="empty-content">Sự kiện này chưa có nội dung.</p>;
  }

  return (
    <>
      {parseContent(content).map((part) => {
        if (part.type === "space") {
          return <div key={part.key} className="content-space" />;
        }

        if (part.type === "image") {
          return (
            <figure key={part.key} className="inline-event-image">
              <img
                src={part.url}
                alt={part.caption || "Ảnh minh họa sự kiện"}
                loading="lazy"
              />
              {part.caption && (
                <figcaption>{part.caption}</figcaption>
              )}
            </figure>
          );
        }

        return <p key={part.key}>{part.value}</p>;
      })}
    </>
  );
}
