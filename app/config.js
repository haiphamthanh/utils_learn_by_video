import path from "node:path";

const projectRoot = path.resolve(process.cwd());

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(projectRoot, process.env.DATA_DIR || "./data"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  projectRoot
};
