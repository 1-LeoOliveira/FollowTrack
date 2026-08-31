import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstagramNotFoundError } from "./scraper/instagram";

vi.mock("./services/profileService", () => ({
  addProfile: vi.fn(),
  getProfileHistory: vi.fn(),
  InvalidUsernameError: class InvalidUsernameError extends Error {},
  listProfiles: vi.fn(async () => [{ username: "danimoraisoficial", latest: { followers: 100 } }]),
  refreshAllProfiles: vi.fn(async () => []),
  refreshProfile: vi.fn(),
  removeProfile: vi.fn(),
  snapshotsToCsv: vi.fn(() => "data,seguidores,seguindo,posts"),
}));

import * as profileService from "./services/profileService";
import { createServer } from "./server";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe("GET /health", () => {
  it("responds ok without needing an API key", async () => {
    const app = createServer();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("API key auth on /api/profiles", () => {
  it("allows requests when API_KEY is not configured", async () => {
    delete process.env.API_KEY;
    const app = createServer();
    const res = await request(app).get("/api/profiles");
    expect(res.status).toBe(200);
  });

  it("rejects requests without a matching key when API_KEY is set", async () => {
    process.env.API_KEY = "segredo";
    const app = createServer();

    const noHeader = await request(app).get("/api/profiles");
    expect(noHeader.status).toBe(401);

    const wrongHeader = await request(app).get("/api/profiles").set("Authorization", "Bearer errado");
    expect(wrongHeader.status).toBe(401);
  });

  it("allows requests with the correct key", async () => {
    process.env.API_KEY = "segredo";
    const app = createServer();
    const res = await request(app).get("/api/profiles").set("Authorization", "Bearer segredo");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/profiles", () => {
  it("rejects a missing username", async () => {
    delete process.env.API_KEY;
    const app = createServer();
    const res = await request(app).post("/api/profiles").send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when the scraper can't find the profile", async () => {
    delete process.env.API_KEY;
    vi.mocked(profileService.addProfile).mockRejectedValue(new InstagramNotFoundError("perfil_x"));
    const app = createServer();
    const res = await request(app).post("/api/profiles").send({ username: "perfil_x" });
    expect(res.status).toBe(404);
  });
});
