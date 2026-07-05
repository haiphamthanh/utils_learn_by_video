import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());

function defaultPythonBin() {
  const unixVenvPython = path.join(projectRoot, ".venv", "bin", "python");
  const windowsVenvPython = path.join(projectRoot, ".venv", "Scripts", "python.exe");

  if (fs.existsSync(unixVenvPython)) return unixVenvPython;
  if (fs.existsSync(windowsVenvPython)) return windowsVenvPython;
  return "python3";
}

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(projectRoot, process.env.DATA_DIR || "./data"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  projectRoot,
  pythonBin: process.env.PYTHON_BIN || defaultPythonBin(),
  transcriptionProvider: process.env.TRANSCRIPTION_PROVIDER || "local-whisper",
  transcriptionModel: process.env.TRANSCRIPTION_MODEL || "base.en",
  transcriptionLanguage: process.env.TRANSCRIPTION_LANGUAGE || "en",
  whisperDevice: process.env.WHISPER_DEVICE || "cpu",
  openaiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
  lessonProvider: process.env.LESSON_PROVIDER || "local-basic",
  lessonModel: process.env.LESSON_MODEL || "local-basic-v1",
  openaiLessonModel: process.env.OPENAI_LESSON_MODEL || "gpt-5.4-mini"
};
