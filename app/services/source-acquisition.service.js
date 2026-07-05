import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { config } from "../config.js";

function acquisitionError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg"
  }[extension] || "application/octet-stream";
}

function normalizeFailure(stderr) {
  const detail = String(stderr || "").trim();
  const lowered = detail.toLowerCase();

  if (lowered.includes("unsupported url")) {
    return acquisitionError(
      "SOURCE_UNSUPPORTED",
      "This source cannot be imported automatically. You can still attach the media manually."
    );
  }

  if (
    lowered.includes("sign in") ||
    lowered.includes("log in") ||
    lowered.includes("login required") ||
    lowered.includes("cookies") ||
    lowered.includes("private video")
  ) {
    return acquisitionError(
      "SOURCE_AUTH_REQUIRED",
      "This source needs your browser login to import automatically. Configure an optional browser-cookie source or attach the media manually."
    );
  }

  if (lowered.includes("larger than max-filesize") || lowered.includes("file is larger")) {
    return acquisitionError(
      "SOURCE_TOO_LARGE",
      `The source media is larger than the ${config.maxUploadMb} MB local limit.`
    );
  }

  return acquisitionError(
    "SOURCE_ACQUISITION_FAILED",
    detail || "The source media could not be imported automatically."
  );
}

export function acquireSourceMedia({ inboxItemId, sourceUrl, onProgress = () => {} }) {
  if (config.mediaAcquisitionProvider === "mock") {
    const outputDirectory = path.join(config.dataDir, "inbox", inboxItemId, "acquired");
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.mkdirSync(outputDirectory, { recursive: true });
    const sourcePath = path.join(config.projectRoot, "tests", "fixtures", "sample-short.mp4");
    const finalPath = path.join(outputDirectory, "source.mp4");
    onProgress(20, "FETCH_SOURCE");
    fs.copyFileSync(sourcePath, finalPath);
    onProgress(100, "COMPLETE");
    const stat = fs.statSync(finalPath);
    return Promise.resolve({
      path: finalPath,
      originalname: "source.mp4",
      mimetype: "video/mp4",
      size: stat.size,
      stdout: "mock acquisition"
    });
  }

  return new Promise((resolve, reject) => {
    const outputDirectory = path.join(
      config.dataDir,
      "inbox",
      inboxItemId,
      "acquired"
    );

    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.mkdirSync(outputDirectory, { recursive: true });

    const outputTemplate = path.join(outputDirectory, "source.%(ext)s");
    const args = [
      "-m",
      "yt_dlp",
      "--no-playlist",
      "--newline",
      "--progress",
      "--socket-timeout",
      "20",
      "--retries",
      "3",
      "--max-filesize",
      `${config.maxUploadMb}M`,
      "--format",
      "bv*+ba/b",
      "--merge-output-format",
      "mp4",
      "--progress-template",
      "download:%(progress._percent_str)s",
      "--print",
      "after_move:filepath",
      "--output",
      outputTemplate
    ];

    if (config.mediaCookieBrowser) {
      args.push("--cookies-from-browser", config.mediaCookieBrowser);
    }

    args.push(sourceUrl);

    const child = spawn(config.pythonBin, args, {
      cwd: config.projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let finalPath = "";

    const handleOutputLine = (line) => {
      const value = String(line || "").trim();
      if (!value) return;

      const progressMatch = value.match(/^download:\s*([0-9.]+)%/i);
      if (progressMatch) {
        const percent = Math.max(0, Math.min(100, Number(progressMatch[1]) || 0));
        onProgress(Math.round(10 + percent * 0.8), "DOWNLOAD_MEDIA");
        return;
      }

      if (fs.existsSync(value)) {
        finalPath = value;
      }
    };

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      text.split(/\r?\n/).forEach(handleOutputLine);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        acquisitionError(
          "SOURCE_ACQUISITION_TOOL_UNAVAILABLE",
          `The local media importer could not start: ${error.message}`,
          error
        )
      );
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(normalizeFailure(stderr));
        return;
      }

      onProgress(92, "FINALIZE_MEDIA");

      if (!finalPath) {
        const candidates = fs.readdirSync(outputDirectory)
          .map((name) => path.join(outputDirectory, name))
          .filter((candidate) => fs.statSync(candidate).isFile());

        if (candidates.length > 0) {
          candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
          finalPath = candidates[0];
        }
      }

      if (!finalPath || !fs.existsSync(finalPath)) {
        reject(
          acquisitionError(
            "SOURCE_MEDIA_NOT_FOUND",
            "The source was opened, but no downloadable media file was produced."
          )
        );
        return;
      }

      const stat = fs.statSync(finalPath);
      onProgress(100, "COMPLETE");

      resolve({
        path: finalPath,
        originalname: path.basename(finalPath),
        mimetype: mimeTypeFor(finalPath),
        size: stat.size,
        stdout
      });
    });
  });
}
