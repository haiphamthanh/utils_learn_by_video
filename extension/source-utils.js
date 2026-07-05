export function detectSource(urlString) {
  const url = new URL(urlString);
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if ((host === "facebook.com" || host.endsWith(".facebook.com")) && /\/reel\//i.test(url.pathname)) {
    return {
      type: "facebook-reel",
      platform: "facebook",
      label: "Facebook Reel"
    };
  }

  if ((host === "youtube.com" || host.endsWith(".youtube.com")) && /\/shorts\//i.test(url.pathname)) {
    return {
      type: "youtube-short",
      platform: "youtube",
      label: "YouTube Short"
    };
  }

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

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "facebook.com" || host.endsWith(".facebook.com")) {
    const reelMatch = url.pathname.match(/\/reel\/(\d+)/i);
    if (reelMatch) {
      return `https://www.facebook.com/reel/${reelMatch[1]}`;
    }
  }

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const shortMatch = url.pathname.match(/\/shorts\/([^/?#]+)/i);
    if (shortMatch) {
      return `https://www.youtube.com/shorts/${shortMatch[1]}`;
    }
  }

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

export function isWebUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}
