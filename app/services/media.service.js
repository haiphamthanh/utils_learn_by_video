import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import multer from "multer";

import { config } from "../config.js";

function mediaError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(mediaError("MEDIA_TOOL_UNAVAILABLE", `${command} could not be started.`, error));
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(
          mediaError(
            "MEDIA_COMMAND_FAILED",
            `${command} failed while processing the media.`,
            stderr.trim()
          )
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

export function createMediaUploadStorage() {
  return multer.diskStorage({
    destination: (_req, _file, callback) => {
      const directory = path.join(config.dataDir, "inbox", "uploads");
      fs.mkdirSync(directory, { recursive: true });
      callback(null, directory);
    },

    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    }
  });
}

export async function probeMedia(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw mediaError("MEDIA_NOT_FOUND", "The attached media file no longer exists.");
  }

  const stat = fs.statSync(inputPath);
  if (!stat.isFile() || stat.size === 0) {
    throw mediaError("MEDIA_EMPTY", "The attached media file is empty.");
  }

  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    inputPath
  ]);

  let metadata;
  try {
    metadata = JSON.parse(stdout);
  } catch (error) {
    throw mediaError("MEDIA_UNREADABLE", "Media metadata could not be read.", error);
  }

  const durationSeconds = Number(metadata.format?.duration || 0);
  const hasVideo = Array.isArray(metadata.streams)
    ? metadata.streams.some((stream) => stream.codec_type === "video")
    : false;
  const hasAudio = Array.isArray(metadata.streams)
    ? metadata.streams.some((stream) => stream.codec_type === "audio")
    : false;

  if (!hasVideo && !hasAudio) {
    throw mediaError("MEDIA_UNSUPPORTED", "No playable audio or video stream was found.");
  }

  if (!hasAudio) {
    throw mediaError("MEDIA_NO_AUDIO", "This media has no audio track to learn from.");
  }

  return {
    durationMs: Math.max(0, Math.round(durationSeconds * 1000)),
    hasVideo,
    hasAudio,
    formatName: metadata.format?.format_name || null
  };
}

export async function prepareMedia({ inputPath, outputDirectory, probe }) {
  fs.mkdirSync(outputDirectory, { recursive: true });

  const audioPath = path.join(outputDirectory, "audio.wav");
  const normalizedVideoPath = probe.hasVideo
    ? path.join(outputDirectory, "normalized.mp4")
    : null;
  const posterPath = probe.hasVideo
    ? path.join(outputDirectory, "poster.jpg")
    : null;

  if (!probe.hasAudio && !probe.hasVideo) {
    throw mediaError("MEDIA_UNSUPPORTED", "The media contains no usable stream.");
  }

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    audioPath
  ]);

  if (probe.hasVideo) {
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      normalizedVideoPath
    ]);

    const seekSeconds = Math.max(0, Math.min(1, (probe.durationMs || 0) / 2000));

    await runCommand("ffmpeg", [
      "-y",
      "-ss",
      String(seekSeconds),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      posterPath
    ]);
  }

  return {
    normalizedAudioPath: audioPath,
    normalizedVideoPath,
    posterPath
  };
}
