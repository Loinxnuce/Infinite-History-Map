export type GalleryImage = {
  title: string;
  imageUrl: string;
  pageUrl: string;
};

type CommonsPage = {
  title?: string;
  fullurl?: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    mime?: string;
  }>;
};

const REJECT_WORDS = [
  "flag",
  "coat of arms",
  "logo",
  "icon",
  "seal",
  "emblem",
  "symbol",
  "locator map",
  "location map",
  "blank map",
  "map of",
  "diagram",
  "graph",
  "chart",
];

function looksLikeRepresentativeImage(
  page: CommonsPage
) {
  const title =
    page.title?.toLowerCase() ?? "";

  const info = page.imageinfo?.[0];

  const mime =
    info?.mime?.toLowerCase() ?? "";

  const isRasterImage =
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/tiff";

  if (!isRasterImage) return false;

  return !REJECT_WORDS.some((word) =>
    title.includes(word)
  );
}

function cleanTitle(title: string) {
  return title
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, " ");
}

async function commonsSearch(
  query: string,
  limit = 30
): Promise<CommonsPage[]> {
  const url = new URL(
    "https://commons.wikimedia.org/w/api.php"
  );

  url.searchParams.set("origin", "*");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(limit));
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set(
    "prop",
    "imageinfo|info"
  );
  url.searchParams.set(
    "iiprop",
    "url|mime"
  );
  url.searchParams.set(
    "iiurlwidth",
    "900"
  );
  url.searchParams.set(
    "inprop",
    "url"
  );

  const response = await fetch(
    url.toString()
  );

  if (!response.ok) {
    throw new Error(
      "Không thể kết nối tới Wikimedia Commons."
    );
  }

  const data = await response.json();

  return Object.values(
    (data?.query?.pages ?? {}) as Record<
      string,
      CommonsPage
    >
  );
}

export async function findEventGallery(
  eventTitle: string,
  year?: number | null
): Promise<GalleryImage[]> {
  const queries = [
    `"${eventTitle}"`,
    year
      ? `${eventTitle} ${year}`
      : eventTitle,
    eventTitle,
  ];

  const results: GalleryImage[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const pages =
      await commonsSearch(query);

    for (const page of pages) {
      if (
        !looksLikeRepresentativeImage(page)
      ) {
        continue;
      }

      const info =
        page.imageinfo?.[0];

      const imageUrl =
        info?.thumburl ??
        info?.url;

      if (
        !imageUrl ||
        !page.fullurl ||
        !page.title
      ) {
        continue;
      }

      if (seen.has(imageUrl)) {
        continue;
      }

      seen.add(imageUrl);

      results.push({
        title: cleanTitle(page.title),
        imageUrl,
        pageUrl: page.fullurl,
      });

      if (results.length >= 10) {
        return results;
      }
    }
  }

  return results;
}
