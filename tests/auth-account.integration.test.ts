import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const id = randomUUID();
const username = `test_${id.replaceAll("-", "").slice(0, 18)}`;
const email = `${id}@example.test`;
const original = `Before-${randomUUID()}`;
const replacement = `After-${randomUUID()}`;
const origin = process.env.BETTER_AUTH_URL || "http://localhost:3000";

async function request(path: string, body?: object, cookie = "") {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: { origin, cookie, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
beforeAll(async () => {
  await prisma.user.create({
    data: {
      id,
      email,
      username,
      name: "Temporary account test",
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(original),
        },
      },
    },
  });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
});

it("supports nickname/email login and changes only an authenticated user's password while revoking other sessions", async () => {
  const login = await request("/sign-in/username", {
    username: username.toUpperCase(),
    password: original,
  });
  expect(login.status).toBe(200);
  expect((await login.json()).user.id).toBe(id);
  const cookie = cookies(login);
  const otherLogin = await request("/sign-in/email", {
    email,
    password: original,
  });
  expect(otherLogin.status).toBe(200);
  const otherCookie = cookies(otherLogin);
  const change = {
    currentPassword: original,
    newPassword: replacement,
    revokeOtherSessions: true,
  };
  expect((await request("/change-password", change)).status).toBe(401);
  expect(
    (
      await request(
        "/change-password",
        { ...change, currentPassword: "incorrect-password" },
        cookie,
      )
    ).ok,
  ).toBe(false);
  expect(
    (
      await request(
        "/change-password",
        { ...change, newPassword: "short" },
        cookie,
      )
    ).ok,
  ).toBe(false);
  const changed = await request("/change-password", change, cookie);
  expect(changed.status).toBe(200);
  expect(
    await (await request("/get-session", undefined, otherCookie)).json(),
  ).toBeNull();
  expect(
    (await request("/sign-in/username", { username, password: original })).ok,
  ).toBe(false);
  const updatedLogin = await request("/sign-in/username", {
    username,
    password: replacement,
  });
  expect(updatedLogin.status).toBe(200);
  expect((await updatedLogin.json()).user.id).toBe(id);
  expect(
    (await request("/sign-in/email", { email, password: replacement })).status,
  ).toBe(200);
  expect(
    (
      await request("/sign-up/email", {
        email: `closed-${email}`,
        name: "Closed signup",
        password: replacement,
      })
    ).ok,
  ).toBe(false);
});
