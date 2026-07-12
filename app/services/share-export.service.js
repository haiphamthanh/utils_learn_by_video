import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { config } from "../config.js";
import {
  SHARE_MANIFEST,
  buildSlug,
  listExportableShareLessons,
  upsertRegistryEntry,
  markLessonsAsExported,
  shareError
} from "./share.service.js";

export async function createShareZip({ lessonIds, noMedia = false, outPath = null } = {}) {
  const exportable = listExportableShareLessons();
  if (!exportable.length) {
    throw shareError("SHARE_NO_LESSONS", "No ready lessons found to export.", 400);
  }

  let selected = exportable;
  if (lessonIds && lessonIds.length) {
    selected = exportable.filter((item) => lessonIds.includes(item.id));
    if (!selected.length) {
      throw shareError("SHARE_LESSONS_NOT_FOUND", "No matching lessons for given ids.", 404);
    }
  }

  selected = selected.filter((lesson) => lesson.lessonJsonPath && fs.existsSync(lesson.lessonJsonPath));

  if (!selected.length) {
    throw shareError("SHARE_NO_ARTIFACTS", "No lessons with valid artifacts found on disk.", 400);
  }

  const { default: AdmZip } = await import("adm-zip");
  const zip = new AdmZip();
  const manifestLessons = [];

  for (const lesson of selected) {
    const artifact = JSON.parse(fs.readFileSync(lesson.lessonJsonPath, "utf-8"));
    const slug = buildSlug({ title: lesson.title, sourceUrl: lesson.sourceUrl });
    const lessonDir = `lessons/${slug}`;

    const meta = {
      slug,
      title: lesson.title,
      sourceUrl: lesson.sourceUrl || null,
      sourceType: lesson.sourceType,
      sourcePlatform: lesson.sourcePlatform,
      sourceTitle: lesson.sourceTitle,
      sourceAuthor: lesson.sourceAuthor,
      sourceCapturedAt: lesson.sourceCapturedAt,
      personalNote: lesson.personalNote || "",
      difficulty: lesson.difficulty,
      topic: lesson.topic,
      provider: lesson.provider,
      model: lesson.model,
      learningStatus: lesson.learningStatus,
      lessonId: lesson.id,
      inboxItemId: lesson.inboxItemId,
      createdAt: lesson.createdAt
    };

    zip.addFile(`${lessonDir}/meta.json`, Buffer.from(JSON.stringify(meta, null, 2), "utf-8"));

    const cleanedArtifact = JSON.parse(JSON.stringify(artifact));
    if (cleanedArtifact.media) {
      for (const key of ["videoPath", "audioPath", "posterPath"]) {
        if (cleanedArtifact.media[key] !== undefined) cleanedArtifact.media[key] = cleanedArtifact.media[key] ? "[media file]" : null;
      }
    }
    zip.addFile(`${lessonDir}/lesson.json`, Buffer.from(JSON.stringify(cleanedArtifact, null, 2), "utf-8"));

    const transcript = artifact?.transcript;
    if (transcript) {
      zip.addFile(`${lessonDir}/transcript.json`, Buffer.from(JSON.stringify({
        language: transcript.language || null,
        provider: transcript.provider || null,
        model: transcript.model || null,
        text: transcript.rawText || "",
        segments: (transcript.segments || []).map((segment) => ({
          sequence: segment.sequence,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.rawText || segment.text || "",
          cleanedText: segment.cleanedText || null,
          reviewedText: segment.reviewedText || null,
          confidence: segment.confidence ?? null,
          reviewStatus: segment.reviewStatus || "UNREVIEWED"
        }))
      }, null, 2), "utf-8"));
    }

    const mediaIncluded = { video: false, audio: false, poster: false };
    if (!noMedia) {
      mediaIncluded.video = addMediaToZip(zip, lesson.videoPath, `${lessonDir}/media/video.mp4`);
      mediaIncluded.audio = addMediaToZip(zip, lesson.audioPath, `${lessonDir}/media/audio.wav`);
      mediaIncluded.poster = addMediaToZip(zip, lesson.posterPath, `${lessonDir}/media/poster.jpg`);
    }

    upsertRegistryEntry({
      slug,
      title: lesson.title,
      sourceUrl: lesson.sourceUrl || null,
      inboxItemId: lesson.inboxItemId,
      lessonId: lesson.id,
      deleted: false,
      lastExportedAt: new Date().toISOString()
    });

    manifestLessons.push({
      slug,
      title: lesson.title,
      sourceUrl: lesson.sourceUrl || null,
      media: mediaIncluded
    });
  }

  const manifest = {
    format: SHARE_MANIFEST.format,
    version: SHARE_MANIFEST.version,
    exportedAt: new Date().toISOString(),
    exportedBy: os.hostname() || "unknown",
    options: { noMedia },
    lessons: manifestLessons
  };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));

  const filename = `enjoy-journal-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const exportPath = outPath
    ? path.resolve(outPath)
    : path.join(config.dataDir, "exports", filename);

  fs.mkdirSync(path.dirname(exportPath), { recursive: true });
  zip.writeZip(exportPath);

  return {
    filename: path.basename(exportPath),
    path: exportPath,
    count: manifestLessons.length,
    lessons: manifestLessons
  };
}

function addMediaToZip(zip, localPath, entry) {
  if (!localPath || !fs.existsSync(localPath)) return false;
  zip.addFile(entry, fs.readFileSync(localPath));
  return true;
}
