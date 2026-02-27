const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SESSION_COOKIE = "corpo_ativo_session";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : false
});

const publicFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js"
};

async function main() {
  await initializeDatabase();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url);
        return;
      }

      if (publicFiles[url.pathname]) {
        return serveStatic(response, path.join(ROOT, publicFiles[url.pathname]));
      }

      sendJson(response, 404, { error: "Rota não encontrada." });
    } catch {
      sendJson(response, 500, { error: "Erro interno no servidor." });
    }
  });

  server.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error("Falha ao iniciar servidor:", error);
  process.exit(1);
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price TEXT NOT NULL,
      description TEXT NOT NULL,
      featured BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS coaches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      day TEXT NOT NULL,
      hours TEXT NOT NULL,
      details TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await seedDatabase();
}

async function handleApi(request, response, url) {
  try {
    const method = request.method;

    if (method === "GET" && url.pathname === "/api/public-data") {
      return sendJson(response, 200, {
        plans: await listPlans(),
        coaches: await listCoaches(),
        schedules: await listSchedules()
      });
    }

    if (method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "email", "password"]);

      const email = String(body.email).trim().toLowerCase();
      const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
      if (existing.rowCount) {
        return sendJson(response, 409, { error: "Este e-mail já está cadastrado." });
      }

      const passwordHash = hashPassword(body.password);
      const result = await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'member') RETURNING id, name, email, role",
        [String(body.name).trim(), email, passwordHash]
      );

      const user = result.rows[0];
      await createSession(response, user.id);
      return sendJson(response, 201, { user });
    }

    if (method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      validateFields(body, ["email", "password"]);

      const email = String(body.email).trim().toLowerCase();
      const result = await pool.query(
        "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
        [email]
      );
      const user = result.rows[0];
      if (!user || !verifyPassword(body.password, user.password_hash)) {
        return sendJson(response, 401, { error: "E-mail ou senha inválidos." });
      }

      await createSession(response, user.id);
      return sendJson(response, 200, { user: sanitizeUser(user) });
    }

    if (method === "POST" && url.pathname === "/api/auth/logout") {
      const session = await getSession(request);
      if (session) {
        await pool.query("DELETE FROM sessions WHERE token = $1", [session.token]);
      }
      clearSession(response);
      return sendJson(response, 200, { success: true });
    }

    if (method === "GET" && url.pathname === "/api/auth/me") {
      const sessionUser = await requireUser(request, response);
      if (!sessionUser) return;
      return sendJson(response, 200, { user: sanitizeUser(sessionUser) });
    }

    if (method === "POST" && url.pathname === "/api/leads") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "email"]);
      await pool.query("INSERT INTO leads (name, email) VALUES ($1, $2)", [
        String(body.name).trim(),
        String(body.email).trim().toLowerCase()
      ]);
      return sendJson(response, 201, { success: true });
    }

    const owner = await requireOwner(request, response);
    if (!owner) return;

    if (method === "GET" && url.pathname === "/api/admin/dashboard") {
      return sendJson(response, 200, {
        user: sanitizeUser(owner),
        plans: await listPlans(),
        coaches: await listCoaches(),
        schedules: await listSchedules(),
        leads: await listLeads()
      });
    }

    if (method === "POST" && url.pathname === "/api/admin/plans") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "price", "description"]);
      const featured = Boolean(body.featured);
      if (featured) {
        await pool.query("UPDATE plans SET featured = FALSE");
      }
      await pool.query(
        "INSERT INTO plans (name, price, description, featured) VALUES ($1, $2, $3, $4)",
        [String(body.name).trim(), String(body.price).trim(), String(body.description).trim(), featured]
      );
      return sendJson(response, 201, { plans: await listPlans() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/plans/")) {
      await pool.query("DELETE FROM plans WHERE id = $1", [Number(url.pathname.split("/").pop())]);
      return sendJson(response, 200, { plans: await listPlans() });
    }

    if (method === "POST" && url.pathname === "/api/admin/coaches") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "role"]);
      await pool.query("INSERT INTO coaches (name, role) VALUES ($1, $2)", [
        String(body.name).trim(),
        String(body.role).trim()
      ]);
      return sendJson(response, 201, { coaches: await listCoaches() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/coaches/")) {
      await pool.query("DELETE FROM coaches WHERE id = $1", [Number(url.pathname.split("/").pop())]);
      return sendJson(response, 200, { coaches: await listCoaches() });
    }

    if (method === "POST" && url.pathname === "/api/admin/schedules") {
      const body = await readJsonBody(request);
      validateFields(body, ["day", "hours", "details"]);
      await pool.query("INSERT INTO schedules (day, hours, details) VALUES ($1, $2, $3)", [
        String(body.day).trim(),
        String(body.hours).trim(),
        String(body.details).trim()
      ]);
      return sendJson(response, 201, { schedules: await listSchedules() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/schedules/")) {
      await pool.query("DELETE FROM schedules WHERE id = $1", [Number(url.pathname.split("/").pop())]);
      return sendJson(response, 200, { schedules: await listSchedules() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/leads/")) {
      await pool.query("DELETE FROM leads WHERE id = $1", [Number(url.pathname.split("/").pop())]);
      return sendJson(response, 200, { leads: await listLeads() });
    }

    return sendJson(response, 404, { error: "Rota de API não encontrada." });
  } catch (error) {
    const message = error.message || "";
    const status = message.includes("Campo obrigatório") || message.includes("JSON invalido") ? 400 : 500;
    return sendJson(response, status, { error: status === 400 ? message : "Erro interno no servidor." });
  }
}

function serveStatic(response, filePath) {
  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  }[ext] || "application/octet-stream";

  const content = fs.readFileSync(filePath);
  response.writeHead(200, { "Content-Type": contentType });
  response.end(content);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1000000) reject(new Error("Body muito grande."));
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON inválido."));
      }
    });
    request.on("error", reject);
  });
}

function validateFields(body, fields) {
  for (const field of fields) {
    if (!body[field] || !String(body[field]).trim()) {
      throw new Error(`Campo obrigatório ausente: ${field}`);
    }
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, originalHash] = String(passwordHash).split(":");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
}

async function seedDatabase() {
  const ownerExists = await pool.query("SELECT id FROM users WHERE email = $1", ["admin@corpoativo.com"]);
  if (!ownerExists.rowCount) {
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'owner')",
      ["Administrador Corpo Ativo", "admin@corpoativo.com", hashPassword("corpo123")]
    );
  }

  const plansCount = await pool.query("SELECT COUNT(*)::int AS total FROM plans");
  if (!plansCount.rows[0].total) {
    await pool.query(
      "INSERT INTO plans (name, price, description, featured) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)",
      [
        "Start", "R$ 89", "Acesso à musculação e avaliação inicial.", false,
        "Black", "R$ 149", "Musculação, funcional, consultoria e acesso 24 horas.", true,
        "Elite", "R$ 219", "Treino personalizado, recovery e acompanhamento premium.", false
      ]
    );
  }

  const coachesCount = await pool.query("SELECT COUNT(*)::int AS total FROM coaches");
  if (!coachesCount.rows[0].total) {
    await pool.query(
      "INSERT INTO coaches (name, role) VALUES ($1, $2), ($3, $4), ($5, $6)",
      [
        "Lucas Mendes", "Hipertrofia e força",
        "Ana Ribeiro", "Funcional e definição",
        "Bruno Costa", "Performance e condicionamento"
      ]
    );
  }

  const schedulesCount = await pool.query("SELECT COUNT(*)::int AS total FROM schedules");
  if (!schedulesCount.rows[0].total) {
    await pool.query(
      "INSERT INTO schedules (day, hours, details) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
      [
        "Seg a Sex", "05:00 às 23:00", "Musculação, cardio e funcional",
        "Sábado", "08:00 as 18:00", "Aulas especiais e treino livre",
        "Domingo", "08:00 as 14:00", "Recovery, cardio e mobilidade"
      ]
    );
  }
}

async function listPlans() {
  const result = await pool.query("SELECT id, name, price, description, featured FROM plans ORDER BY featured DESC, id ASC");
  return result.rows;
}

async function listCoaches() {
  const result = await pool.query("SELECT id, name, role FROM coaches ORDER BY id ASC");
  return result.rows;
}

async function listSchedules() {
  const result = await pool.query("SELECT id, day, hours, details FROM schedules ORDER BY id ASC");
  return result.rows;
}

async function listLeads() {
  const result = await pool.query("SELECT id, name, email, created_at AS \"createdAt\" FROM leads ORDER BY id DESC");
  return result.rows;
}

function parseCookies(request) {
  const raw = request.headers.cookie || "";
  return raw.split(";").reduce((cookies, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

async function getSession(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const result = await pool.query(
    `SELECT sessions.token, users.id, users.name, users.email, users.role
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

async function createSession(response, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, userId]);
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearSession(response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function sanitizeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function requireUser(request, response) {
  const session = await getSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Faça login para continuar." });
    return null;
  }
  return session;
}

async function requireOwner(request, response) {
  const user = await requireUser(request, response);
  if (!user) return null;
  if (user.role !== "owner") {
    sendJson(response, 403, { error: "Acesso restrito ao proprietário." });
    return null;
  }
  return user;
}

