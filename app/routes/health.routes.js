import { Router } from "express";

export function createHealthRouter() {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      data: {
        status: "ok",
        service: "enjoy-journal"
      },
      error: null
    });
  });

  return router;
}
