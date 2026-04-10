import { NextResponse } from "next/server";

/**
 * GET /api/version
 *
 * Returns the current deployed commit SHA and timestamp.
 * Used by the deploy status indicator to detect when a new version is live.
 */
export async function GET() {
  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    env: process.env.VERCEL_ENV ?? "development",
    ts: Date.now(),
  });
}
