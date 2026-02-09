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

  if (!identityToken) {
    res.status(401).json({
      error: "Missing X-Moltbook-Identity header",
      hint: "Obtain an identity token via POST https://moltbook.com/api/v1/agents/me/identity-token",
    });
    return;
  }

  const result = await verifyIdentity(identityToken);

  if (!result || !result.valid) {
    res.status(401).json({
      error: "Invalid or expired Moltbook identity token",
    });
    return;
  }

  req.moltbookAgent = result.agent;
  next();
}
