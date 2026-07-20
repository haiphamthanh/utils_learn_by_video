const STORAGE_KEY = "enjoy-journal.ui-settings.v1";

const defaultSettings = {
  activePage: "journal",
  scrollByPage: {
    journal: 0,
    library: 0,
    notes: 0,
    share: 0
  },
  features: {
    notes: false
  },
  journal: {
    search: "",
    status: "",
    favorite: false,
    tag: "",
    type: "all"
  },
  library: {
    search: "",
    status: "",
    favorite: false,
    tag: "",
    tagsExpanded: false
  },
  notes: {
    search: "",
    tag: "",
    status: "",
    favorite: false
  },
  lesson: null
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeSettings(base, patch) {
  if (!isObject(base) || !isObject(patch)) return patch;
  const merged = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    merged[key] = isObject(value) && isObject(base[key])
      ? mergeSettings(base[key], value)
      : value;
  }

  return merged;
}

function readStoredSettings() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return isObject(stored) ? mergeSettings(defaultSettings, stored) : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

let settings = readStoredSettings();

export function getUiSettings() {
  return settings;
}

export function updateUiSettings(patch) {
  settings = mergeSettings(settings, patch);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // UI persistence should never prevent the local app from working.
  }
  return settings;
}
