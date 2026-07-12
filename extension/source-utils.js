const GENERIC_FACEBOOK_TITLES = new Set([
  "facebook",
  "facebook reel",
  "reel facebook",
  "facebook reels",
  "reels facebook",
  "watch facebook",
  "facebook video"
]);

function hostWithoutWww(url) {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

function isFacebookHost(host) {
  return host === "facebook.com" || host.endsWith(".facebook.com");
}

function isYoutubeHost(host) {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

function facebookReelId(url) {
  return url.pathname.match(/\/reel\/(\d+)/i)?.[1] || "";
}

function cleanFacebookTitle(value, urlString = "") {
  const title = cleanTitle(value)
    .replace(/\s+\|\s+Facebook$/i, "")
    .replace(/\s+-\s+Facebook$/i, "")
    .replace(/\s+Facebook$/i, "")
    .trim();

  const normalized = title.toLocaleLowerCase();
  if (!title || GENERIC_FACEBOOK_TITLES.has(normalized)) {
    try {
      const id = facebookReelId(new URL(urlString));
      return id ? `Facebook Reel ${id}` : "Facebook Reel";
    } catch {
      return "Facebook Reel";
    }
  }

  return title;
}

export const sourceProviders = [
  {
    type: "facebook-reel",
    platform: "facebook",
    label: "Facebook Reel",
    matches(url) {
      return isFacebookHost(hostWithoutWww(url)) && /\/reel\//i.test(url.pathname);
    },
    normalize(url) {
      const id = facebookReelId(url);
      return id ? `https://www.facebook.com/reel/${id}` : url.toString();
    },
    cleanTitle: cleanFacebookTitle
  },
  {
    type: "youtube-short",
    platform: "youtube",
    label: "YouTube Short",
    matches(url) {
      return isYoutubeHost(hostWithoutWww(url)) && /\/shorts\//i.test(url.pathname);
    },
    normalize(url) {
      const shortId = url.pathname.match(/\/shorts\/([^/?#]+)/i)?.[1] || "";
      return shortId ? `https://www.youtube.com/shorts/${shortId}` : url.toString();
    },
    cleanTitle
  }
];

export function providerForUrl(urlString) {
  const url = new URL(urlString);
  return sourceProviders.find((provider) => provider.matches(url)) || null;
}

export function detectSource(urlString) {
  const url = new URL(urlString);
  const provider = sourceProviders.find((item) => item.matches(url));
  if (provider) {
    return {
      type: provider.type,
      platform: provider.platform,
      label: provider.label
    };
  }

  const host = hostWithoutWww(url);
  return {
    type: "other-url",
    platform: host,
    label: "Web page"
  };
}

export function normalizeSourceUrl(input) {
  const url = new URL(input);
  url.hash = "";

  const trackingKeys = [
    "fbclid",
    "gclid",
    "igsh",
    "si",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content"
  ];

  for (const key of trackingKeys) {
    url.searchParams.delete(key);
  }

  const provider = sourceProviders.find((item) => item.matches(url));
  if (provider) return provider.normalize(url);

  return url.toString();
}

export function chooseSourceUrl(tabUrl, canonicalUrl) {
  const current = isWebUrl(tabUrl) ? normalizeSourceUrl(tabUrl) : null;

  if (current) {
    const currentSource = detectSource(current);
    if (currentSource.type !== "other-url") return current;
  }

  if (isWebUrl(canonicalUrl)) return normalizeSourceUrl(canonicalUrl);
  if (current) return current;

  throw new Error("This page does not have a valid web URL.");
}

export function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function cleanSourceTitle(value, urlString) {
  const provider = providerForUrl(urlString);
  return provider?.cleanTitle
    ? provider.cleanTitle(value, urlString)
    : cleanTitle(value);
}

export function isWebUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}
