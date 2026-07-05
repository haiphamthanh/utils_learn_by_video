const major = Number.parseInt(process.versions.node.split(".")[0], 10);
const supportedMajors = new Set([22, 24, 26]);

console.log(
  `Node.js ${process.version} · ${process.platform}/${process.arch} · ABI ${process.versions.modules}`
);

if (!supportedMajors.has(major)) {
  console.error();
  console.error(`Unsupported Node.js major version: ${major}.`);
  console.error("Use Node.js 24 LTS for the most predictable local setup.");
  process.exit(1);
}

if (major === 26) {
  console.warn("Node.js 26 is supported by the pinned database dependency, but Node.js 24 LTS remains the recommended runtime for this project.");
}
