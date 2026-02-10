import { Request, Response, NextFunction } from "express";
import { verifyIdentity } from "../services/moltbookService";
import { MoltbookAgent } from "../types";

declare global {
  namespace Express {
    interface Request {
      moltbookAgent?: MoltbookAgent;
    }
  }
}

export async function moltbookAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const identityToken = req.headers["x-moltbook-identity"] as string;

  // Moltbook auth is optional — if no token provided, skip validation
  if (!identityToken) {
    next();
    return;
  }

  const result = await verifyIdentity(identityToken);

  if (!result || !result.valid) {
    // Token was provided but invalid — still allow through (Moltbook may be down)
    console.warn("Moltbook token provided but validation failed — proceeding without auth");
    next();
    return;
  }

  req.moltbookAgent = result.agent;
  next();
}
