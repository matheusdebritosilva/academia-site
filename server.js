const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "corpo-ativo.db");
const SESSION_COOKIE = "corpo_ativo_session";

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price TEXT NOT NULL,
    description TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    hours TEXT NOT NULL,
    details TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

seedDatabase();

const publicFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js"
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (publicFiles[url.pathname]) {
      serveStatic(response, path.join(ROOT, publicFiles[url.pathname]));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Rota não encontrada." }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Erro interno no servidor." }));
  }
});

server.listen(PORT, () => {
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
});

async function handleApi(request, response, url) {
  try {
    const method = request.method;

    if (method === "GET" && url.pathname === "/api/public-data") {
      return sendJson(response, 200, {
        plans: listPlans(),
        coaches: listCoaches(),
        schedules: listSchedules()
      });
    }

    if (method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "email", "password"]);

      const email = String(body.email).trim().toLowerCase();
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) {
        return sendJson(response, 409, { error: "Este e-mail já está cadastrado." });
      }

      const passwordHash = hashPassword(body.password);
      const result = db
        .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'member')")
        .run(String(body.name).trim(), email, passwordHash);

      const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(result.lastInsertRowid);
      createSession(response, user.id);
      return sendJson(response, 201, { user });
    }

    if (method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      validateFields(body, ["email", "password"]);

      const email = String(body.email).trim().toLowerCase();
      const user = db.prepare("SELECT id, name, email, role, password_hash FROM users WHERE email = ?").get(email);
      if (!user || !verifyPassword(body.password, user.password_hash)) {
        return sendJson(response, 401, { error: "E-mail ou senha inválidos." });
      }

      createSession(response, user.id);
      return sendJson(response, 200, { user: sanitizeUser(user) });
    }

    if (method === "POST" && url.pathname === "/api/auth/logout") {
      const session = getSession(request);
      if (session) {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(session.token);
      }
      clearSession(response);
      return sendJson(response, 200, { success: true });
    }

    if (method === "GET" && url.pathname === "/api/auth/me") {
      const sessionUser = requireUser(request, response);
      if (!sessionUser) return;
      return sendJson(response, 200, { user: sanitizeUser(sessionUser) });
    }

    if (method === "POST" && url.pathname === "/api/leads") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "email"]);
      db.prepare("INSERT INTO leads (name, email) VALUES (?, ?)").run(
        String(body.name).trim(),
        String(body.email).trim().toLowerCase()
      );
      return sendJson(response, 201, { success: true });
    }

    const owner = requireOwner(request, response);
    if (!owner) return;

    if (method === "GET" && url.pathname === "/api/admin/dashboard") {
      return sendJson(response, 200, {
        user: sanitizeUser(owner),
        plans: listPlans(),
        coaches: listCoaches(),
        schedules: listSchedules(),
        leads: listLeads()
      });
    }

    if (method === "POST" && url.pathname === "/api/admin/plans") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "price", "description"]);
      const featured = body.featured ? 1 : 0;
      if (featured) {
        db.prepare("UPDATE plans SET featured = 0").run();
      }
      db.prepare("INSERT INTO plans (name, price, description, featured) VALUES (?, ?, ?, ?)").run(
        String(body.name).trim(),
        String(body.price).trim(),
        String(body.description).trim(),
        featured
      );
      return sendJson(response, 201, { plans: listPlans() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/plans/")) {
      const id = Number(url.pathname.split("/").pop());
      db.prepare("DELETE FROM plans WHERE id = ?").run(id);
      return sendJson(response, 200, { plans: listPlans() });
    }

    if (method === "POST" && url.pathname === "/api/admin/coaches") {
      const body = await readJsonBody(request);
      validateFields(body, ["name", "role"]);
      db.prepare("INSERT INTO coaches (name, role) VALUES (?, ?)").run(
        String(body.name).trim(),
        String(body.role).trim()
      );
      return sendJson(response, 201, { coaches: listCoaches() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/coaches/")) {
      const id = Number(url.pathname.split("/").pop());
      db.prepare("DELETE FROM coaches WHERE id = ?").run(id);
      return sendJson(response, 200, { coaches: listCoaches() });
    }

    if (method === "POST" && url.pathname === "/api/admin/schedules") {
      const body = await readJsonBody(request);
      validateFields(body, ["day", "hours", "details"]);
      db.prepare("INSERT INTO schedules (day, hours, details) VALUES (?, ?, ?)").run(
        String(body.day).trim(),
        String(body.hours).trim(),
        String(body.details).trim()
      );
      return sendJson(response, 201, { schedules: listSchedules() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/schedules/")) {
      const id = Number(url.pathname.split("/").pop());
      db.prepare("DELETE FROM schedules WHERE id = ?").run(id);
      return sendJson(response, 200, { schedules: listSchedules() });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/admin/leads/")) {
      const id = Number(url.pathname.split("/").pop());
      db.prepare("DELETE FROM leads WHERE id = ?").run(id);
      return sendJson(response, 200, { leads: listLeads() });
    }

    return sendJson(response, 404, { error: "Rota de API não encontrada." });
  } catch (error) {
    const status = error.message.includes("Campo obrigatório") || error.message.includes("JSON inválido") ? 400 : 500;
    return sendJson(response, status, { error: status === 400 ? error.message : "Erro interno no servidor." });
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
      if (raw.length > 1_000_000) {
        reject(new Error("Body muito grande."));
      }
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

function seedDatabase() {
  const ownerExists = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@corpoativo.com");
  if (!ownerExists) {
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'owner')").run(
      "Administrador Corpo Ativo",
      "admin@corpoativo.com",
      hashPassword("corpo123")
    );
  }

  const countPlans = db.prepare("SELECT COUNT(*) AS total FROM plans").get().total;
  if (!countPlans) {
    db.prepare("INSERT INTO plans (name, price, description, featured) VALUES (?, ?, ?, ?)").run("Start", "R$ 89", "Acesso à musculação e avaliação inicial.", 0);
    db.prepare("INSERT INTO plans (name, price, description, featured) VALUES (?, ?, ?, ?)").run("Black", "R$ 149", "Musculação, funcional, consultoria e acesso 24 horas.", 1);
    db.prepare("INSERT INTO plans (name, price, description, featured) VALUES (?, ?, ?, ?)").run("Elite", "R$ 219", "Treino personalizado, recovery e acompanhamento premium.", 0);
  }

  const countCoaches = db.prepare("SELECT COUNT(*) AS total FROM coaches").get().total;
  if (!countCoaches) {
    db.prepare("INSERT INTO coaches (name, role) VALUES (?, ?)").run("Lucas Mendes", "Hipertrofia e força");
    db.prepare("INSERT INTO coaches (name, role) VALUES (?, ?)").run("Ana Ribeiro", "Funcional e definição");
    db.prepare("INSERT INTO coaches (name, role) VALUES (?, ?)").run("Bruno Costa", "Performance e condicionamento");
  }

  const countSchedules = db.prepare("SELECT COUNT(*) AS total FROM schedules").get().total;
  if (!countSchedules) {
    db.prepare("INSERT INTO schedules (day, hours, details) VALUES (?, ?, ?)").run("Seg a Sex", "05:00 às 23:00", "Musculação, cardio e funcional");
    db.prepare("INSERT INTO schedules (day, hours, details) VALUES (?, ?, ?)").run("Sábado", "08:00 às 18:00", "Aulas especiais e treino livre");
    db.prepare("INSERT INTO schedules (day, hours, details) VALUES (?, ?, ?)").run("Domingo", "08:00 às 14:00", "Recovery, cardio e mobilidade");
  }
}

function listPlans() {
  return db.prepare("SELECT id, name, price, description, featured FROM plans ORDER BY featured DESC, id ASC").all().map((row) => ({
    ...row,
    featured: Boolean(row.featured)
  }));
}

function listCoaches() {
  return db.prepare("SELECT id, name, role FROM coaches ORDER BY id ASC").all();
}

function listSchedules() {
  return db.prepare("SELECT id, day, hours, details FROM schedules ORDER BY id ASC").all();
}

function listLeads() {
  return db.prepare("SELECT id, name, email, created_at AS createdAt FROM leads ORDER BY id DESC").all();
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

function getSession(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return db.prepare(`
    SELECT sessions.token, users.id, users.name, users.email, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
}

function createSession(response, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId);
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearSession(response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function requireUser(request, response) {
  const session = getSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Faça login para continuar." });
    return null;
  }
  return session;
}

function requireOwner(request, response) {
  const user = requireUser(request, response);
  if (!user) return null;
  if (user.role !== "owner") {
    sendJson(response, 403, { error: "Acesso restrito ao proprietário." });
    return null;
  }
  return user;
}
