import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/extension(.*)",
  "/api/cron(.*)",
  "/api/gmail/sync",
  "/api/pipeline/api-sources",
  "/api/applications/backfill-jd",
  "/api/applications/backfill-jd-email",
  "/api/applications/patch-jd",
  "/api/sms/webhook",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Exclude cron routes — they use CRON_SECRET bearer auth, not Clerk JWTs.
    // Clerk rejects non-JWT bearer tokens even on public routes, causing 404s.
    "/((?!_next|api/cron|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/cron)|trpc)(.*)",
  ],
};
