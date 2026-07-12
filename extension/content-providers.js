(function () {
  const GENERIC_FACEBOOK_TITLES = new Set([
    "facebook",
    "facebook reel",
    "reel facebook",
    "facebook reels",
    "reels facebook",
    "watch facebook",
    "facebook video"
  ]);

  function cleanTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
  }

  function visibleText(node) {
    const text = cleanTitle(node?.innerText || node?.textContent || "");
    if (!text || text.length < 4 || text.length > 180) return "";
    if (/^(facebook|reels?|watch|home|notifications|menu)$/i.test(text)) return "";
    if (/^\d+[KMB]?\s*(comments?|shares?|likes?|views?)?$/i.test(text)) return "";
    return text;
  }

  function facebookReelId(url) {
    return url.pathname.match(/\/reel\/(\d+)/i)?.[1] || "";
  }

  function cleanFacebookTitle(value, url) {
    const title = cleanTitle(value)
      .replace(/\s+\|\s+Facebook$/i, "")
      .replace(/\s+-\s+Facebook$/i, "")
      .replace(/\s+Facebook$/i, "")
      .trim();

    if (!title || GENERIC_FACEBOOK_TITLES.has(title.toLocaleLowerCase())) {
      const id = facebookReelId(url);
      return id ? `Facebook Reel ${id}` : "Facebook Reel";
    }

    return title;
  }

  function facebookVisibleTitle(url) {
    const selectors = [
      '[data-ad-preview="message"]',
      '[role="heading"]',
      "h1",
      "h2",
      'div[dir="auto"]',
      'span[dir="auto"]'
    ];

    const candidates = selectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .map(visibleText)
      .filter(Boolean);

    return cleanFacebookTitle(
      candidates[0] ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector('meta[name="twitter:title"]')?.content ||
        document.title,
      url
    );
  }

  const providers = [
    {
      id: "facebook-reel",
      sourceType: "facebook-reel",
      platform: "facebook",
      label: "Facebook Reel",
      matches(url) {
        const host = url.hostname.replace(/^www\./, "").toLowerCase();
        return (host === "facebook.com" || host.endsWith(".facebook.com")) && /\/reel\//i.test(url.pathname);
      },
      normalizeUrl(url) {
        const id = facebookReelId(url);
        return id ? `https://www.facebook.com/reel/${id}` : url.toString();
      },
      readCapture(url) {
        return {
          sourceType: this.sourceType,
          platform: this.platform,
          label: this.label,
          url: this.normalizeUrl(url),
          title: facebookVisibleTitle(url)
        };
      }
    }
  ];

  window.EnjoyJournalCaptureProviders = {
    all: providers,
    current() {
      let url;
      try {
        url = new URL(location.href);
      } catch {
        return null;
      }

      return providers.find((provider) => provider.matches(url)) || null;
    },
    readCurrentCapture() {
      const provider = this.current();
      if (!provider) return null;
      return provider.readCapture(new URL(location.href));
    }
  };
})();
