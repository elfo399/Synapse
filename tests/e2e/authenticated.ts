import { test as base, expect, type APIRequestContext } from "@playwright/test";

type Session = Awaited<ReturnType<APIRequestContext["storageState"]>>;

// Reuse an authenticated session per worker, while keeping every browser context
// and each test's items isolated. Repeated UI login is covered by workspace.spec.
// This respects the real application's sign-in rate limit as the suite grows.
export const test = base.extend<
  { storageState: Session },
  { authenticatedSession: Session }
>({
  authenticatedSession: [
    async ({ playwright }, provideSession, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL!;
      const origin = new URL(baseURL).origin;
      const request = await playwright.request.newContext({ baseURL });
      try {
        const response = await request.post("/api/auth/sign-in/email", {
          headers: { origin },
          data: {
            email: process.env.INITIAL_ADMIN_EMAIL!,
            password: process.env.INITIAL_ADMIN_PASSWORD!,
          },
        });
        expect(response.status(), "Worker sign-in succeeds").toBe(200);
        await provideSession(await request.storageState());
      } finally {
        await request.post("/api/auth/sign-out", {
          headers: { origin },
          data: {},
        });
        await request.dispose();
      }
    },
    { scope: "worker" },
  ],
  storageState: async ({ authenticatedSession }, provideSession) => {
    await provideSession(authenticatedSession);
  },
});
