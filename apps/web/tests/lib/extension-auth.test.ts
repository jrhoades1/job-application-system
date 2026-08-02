import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getServiceRoleClient: vi.fn(() => mockSupabase),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { getExtensionClient } from "@/lib/extension-auth";
import {
  generateExtensionToken,
  hashExtensionToken,
} from "@/lib/extension-token";

interface TokenRow {
  id: string;
  clerk_user_id: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

/** Rows keyed by token_hash — stands in for the extension_tokens table. */
let rows: Record<string, TokenRow>;
let selectedHash: string | null;
let updates: { id: string; patch: Record<string, unknown> }[];

const mockSupabase = {
  from(table: string) {
    if (table !== "extension_tokens") throw new Error(`unexpected table: ${table}`);
    return {
      select() {
        return {
          eq(column: string, value: string) {
            expect(column).toBe("token_hash");
            selectedHash = value;
            return {
              maybeSingle: async () => ({ data: rows[value] ?? null, error: null }),
            };
          },
        };
      },
      update(patch: Record<string, unknown>) {
        return {
          eq: async (column: string, value: string) => {
            expect(column).toBe("id");
            updates.push({ id: value, patch });
            return { error: null };
          },
        };
      },
    };
  },
};

function seedToken(overrides: Partial<TokenRow> = {}): string {
  const token = generateExtensionToken();
  rows[hashExtensionToken(token)] = {
    id: "tok_1",
    clerk_user_id: "user_owner",
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };
  return token;
}

function bearerRequest(token: string): Request {
  return new Request("https://example.test/api/extension/profile", {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  rows = {};
  selectedHash = null;
  updates = [];
  vi.mocked(auth).mockReset();
});

describe("getExtensionClient — bearer token", () => {
  it("resolves the user id from the matched token row", async () => {
    const token = seedToken({ clerk_user_id: "user_owner" });

    const { userId } = await getExtensionClient(bearerRequest(token));

    expect(userId).toBe("user_owner");
    expect(auth).not.toHaveBeenCalled();
  });

  it("looks up by hash, never by the raw token", async () => {
    const token = seedToken();

    await getExtensionClient(bearerRequest(token));

    expect(selectedHash).toBe(hashExtensionToken(token));
    expect(selectedHash).not.toBe(token);
  });

  it("rejects a token that looks right but has no row", async () => {
    seedToken();
    await expect(
      getExtensionClient(bearerRequest(generateExtensionToken()))
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects a revoked token", async () => {
    const token = seedToken({ revoked_at: new Date().toISOString() });
    await expect(getExtensionClient(bearerRequest(token))).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("rejects the retired jaa_<clerk_user_id> token without hitting the DB", async () => {
    await expect(
      getExtensionClient(bearerRequest("jaa_user_2abcDEFghiJKLmnoPQRstuVWxyz"))
    ).rejects.toThrow("Unauthorized");
    expect(selectedHash).toBeNull();
  });

  it("rejects a bare clerk user id", async () => {
    await expect(
      getExtensionClient(bearerRequest("user_2abcDEFghiJKLmnoPQRstuVWxyz"))
    ).rejects.toThrow("Unauthorized");
    expect(selectedHash).toBeNull();
  });

  it("does not fall back to the Clerk session when the bearer token is bad", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_session" } as never);

    await expect(getExtensionClient(bearerRequest("jaa_nope"))).rejects.toThrow(
      "Unauthorized"
    );
    expect(auth).not.toHaveBeenCalled();
  });

  it("stamps last_used_at on first use", async () => {
    const token = seedToken({ last_used_at: null });

    await getExtensionClient(bearerRequest(token));

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("tok_1");
    expect(updates[0].patch).toHaveProperty("last_used_at");
  });

  it("throttles last_used_at writes for recently used tokens", async () => {
    const token = seedToken({ last_used_at: new Date().toISOString() });

    await getExtensionClient(bearerRequest(token));

    expect(updates).toHaveLength(0);
  });

  it("refreshes last_used_at once it is stale", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const token = seedToken({ last_used_at: oneHourAgo });

    await getExtensionClient(bearerRequest(token));

    expect(updates).toHaveLength(1);
  });
});

describe("getExtensionClient — Clerk session fallback", () => {
  it("uses the Clerk session when no Authorization header is present", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_session" } as never);

    const req = new Request("https://example.test/api/extension/profile");
    const { userId } = await getExtensionClient(req);

    expect(userId).toBe("user_session");
    expect(selectedHash).toBeNull();
  });

  it("throws when there is no session and no token", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const req = new Request("https://example.test/api/extension/profile");
    await expect(getExtensionClient(req)).rejects.toThrow("Unauthorized");
  });
});
