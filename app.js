const state = {
  user: null,
  plans: [],
  coaches: [],
  schedules: [],
  leads: []
};

const topbar = document.querySelector(".topbar");
const hero = document.querySelector(".hero");
const authModal = document.getElementById("authModal");
const openLoginButton = document.getElementById("openLogin");
const navLogoutButton = document.getElementById("navLogout");
const dashboardLink = document.getElementById("dashboardLink");
const authNavGroup = document.getElementById("authNavGroup");
const userPill = document.getElementById("userPill");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authFeedback = document.getElementById("authFeedback");
const logoutButton = document.getElementById("logoutButton");
const adminPanel = document.getElementById("painel");
const adminStatus = document.getElementById("adminStatus");
const memberArea = document.getElementById("conta");
const memberWelcome = document.getElementById("memberWelcome");
const memberDescription = document.getElementById("memberDescription");
const contactForm = document.getElementById("contactForm");
const navLinks = Array.from(document.querySelectorAll(".nav-links a"));
const revealNodes = document.querySelectorAll("[data-reveal]");
const authTabs = Array.from(document.querySelectorAll("[data-auth-tab]"));

initialize().catch(() => {
  authFeedback.textContent = "Não foi possível carregar o sistema.";
});

async function initialize() {
  setupUiEvents();
  await Promise.all([loadPublicData(), loadCurrentUser()]);
  updateTopbarState();
  setupSectionTracking();
  setupRevealAnimations();
}

function setupUiEvents() {
  openLoginButton.addEventListener("click", openModal);
  navLogoutButton.addEventListener("click", logout);
  logoutButton.addEventListener("click", logout);
  authModal.addEventListener("click", (event) => {
    if (event.target.hasAttribute("data-close-modal")) {
      closeModal();
    }
  });

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchAuthTab(tab.dataset.authTab));
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    await submitAuth("/api/auth/login", {
      email: formData.get("email"),
      password: formData.get("password")
    });
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    await submitAuth("/api/auth/register", {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password")
    });
  });

  document.getElementById("planForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await apiFetch("/api/admin/plans", {
      method: "POST",
      body: {
        name: data.get("name"),
        price: data.get("price"),
        description: data.get("description"),
        featured: data.get("featured") === "on"
      }
    });
    event.currentTarget.reset();
    await loadAdminDashboard();
    await loadPublicData();
  });

  document.getElementById("coachForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await apiFetch("/api/admin/coaches", {
      method: "POST",
      body: {
        name: data.get("name"),
        role: data.get("role")
      }
    });
    event.currentTarget.reset();
    await loadAdminDashboard();
    await loadPublicData();
  });

  document.getElementById("scheduleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await apiFetch("/api/admin/schedules", {
      method: "POST",
      body: {
        day: data.get("day"),
        hours: data.get("hours"),
        details: data.get("details")
      }
    });
    event.currentTarget.reset();
    await loadAdminDashboard();
    await loadPublicData();
  });

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await apiFetch("/api/leads", {
      method: "POST",
      body: {
        name: data.get("name"),
        email: data.get("email")
      }
    });
    event.currentTarget.reset();
    if (state.user?.role === "owner") {
      await loadAdminDashboard();
    }
    authFeedback.textContent = "Contato enviado com sucesso.";
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-type][data-id]");
    if (!button) return;

    const { type, id } = button.dataset;
    const routeMap = {
      plan: `/api/admin/plans/${id}`,
      coach: `/api/admin/coaches/${id}`,
      schedule: `/api/admin/schedules/${id}`,
      lead: `/api/admin/leads/${id}`
    };

    await apiFetch(routeMap[type], { method: "DELETE" });
    await loadAdminDashboard();
    if (type !== "lead") {
      await loadPublicData();
    }
  });

  window.addEventListener("scroll", updateTopbarState, { passive: true });
}

async function submitAuth(endpoint, body) {
  authFeedback.textContent = "";
  try {
    const { user } = await apiFetch(endpoint, { method: "POST", body });
    state.user = user;
    renderAuthState();
    closeModal();
    if (user.role === "owner") {
      await loadAdminDashboard();
      adminPanel.scrollIntoView({ behavior: "smooth" });
    }
  } catch (error) {
    authFeedback.textContent = error.message;
  }
}

async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.leads = [];
  renderAuthState();
  renderAdminLists();
}

async function loadCurrentUser() {
  try {
    const { user } = await apiFetch("/api/auth/me");
    state.user = user;
    renderAuthState();
    if (user.role === "owner") {
      await loadAdminDashboard();
    }
  } catch {
    state.user = null;
    renderAuthState();
  }
}

async function loadPublicData() {
  const data = await apiFetch("/api/public-data");
  state.plans = data.plans;
  state.coaches = data.coaches;
  state.schedules = data.schedules;
  renderPublicLists();
}

async function loadAdminDashboard() {
  if (state.user?.role !== "owner") return;
  const data = await apiFetch("/api/admin/dashboard");
  state.leads = data.leads;
  state.plans = data.plans;
  state.coaches = data.coaches;
  state.schedules = data.schedules;
  renderPublicLists();
  renderAdminLists();
}

function renderPublicLists() {
  renderCollection(
    state.plans,
    document.getElementById("planGrid"),
    (plan) => `
      <article class="plan-card ${plan.featured ? "featured" : ""}">
        ${plan.featured ? '<div class="tag">Mais escolhido</div>' : ""}
        <h3>${plan.name}</h3>
        <p class="price">${plan.price}<span>/mês</span></p>
        <p>${plan.description}</p>
        <a class="button ${plan.featured ? "primary" : "secondary"}" href="#contato">Assinar</a>
      </article>
    `,
    "Nenhum plano cadastrado."
  );

  renderCollection(
    state.coaches,
    document.getElementById("coachGrid"),
    (coach) => `
      <article class="coach-card">
        <h3>${coach.name}</h3>
        <p>${coach.role}</p>
      </article>
    `,
    "Nenhum coach cadastrado."
  );

  renderCollection(
    state.schedules,
    document.getElementById("scheduleGrid"),
    (schedule) => `
      <article class="schedule-card">
        <h3>${schedule.day}</h3>
        <p>${schedule.hours}</p>
        <span>${schedule.details}</span>
      </article>
    `,
    "Nenhum horário cadastrado."
  );
}

function renderAdminLists() {
  document.getElementById("metricLeads").textContent = String(state.leads.length);
  document.getElementById("metricPlans").textContent = String(state.plans.length);
  document.getElementById("metricCoaches").textContent = String(state.coaches.length);
  document.getElementById("metricSchedules").textContent = String(state.schedules.length);

  renderCollection(
    state.plans,
    document.getElementById("planAdminList"),
    (plan) => `
      <div class="admin-item">
        <div>
          <strong>${plan.name}${plan.featured ? " · Destaque" : ""}</strong>
          <p>${plan.price} · ${plan.description}</p>
        </div>
        <button class="button secondary item-delete" type="button" data-type="plan" data-id="${plan.id}">Remover</button>
      </div>
    `,
    "Nenhum plano cadastrado."
  );

  renderCollection(
    state.coaches,
    document.getElementById("coachAdminList"),
    (coach) => `
      <div class="admin-item">
        <div>
          <strong>${coach.name}</strong>
          <p>${coach.role}</p>
        </div>
        <button class="button secondary item-delete" type="button" data-type="coach" data-id="${coach.id}">Remover</button>
      </div>
    `,
    "Nenhum coach cadastrado."
  );

  renderCollection(
    state.schedules,
    document.getElementById("scheduleAdminList"),
    (schedule) => `
      <div class="admin-item">
        <div>
          <strong>${schedule.day}</strong>
          <p>${schedule.hours} · ${schedule.details}</p>
        </div>
        <button class="button secondary item-delete" type="button" data-type="schedule" data-id="${schedule.id}">Remover</button>
      </div>
    `,
    "Nenhum horário cadastrado."
  );

  renderCollection(
    state.leads,
    document.getElementById("leadList"),
    (lead) => `
      <div class="lead-item">
        <div>
          <strong>${lead.name}</strong>
          <p>${lead.email}</p>
          <p>Enviado em ${formatDate(lead.createdAt)}</p>
        </div>
        <button class="button secondary item-delete" type="button" data-type="lead" data-id="${lead.id}">Remover</button>
      </div>
    `,
    "Nenhum lead recebido ainda."
  );
}

function renderCollection(items, container, template, emptyMessage) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }
  container.innerHTML = items.map(template).join("");
}

function renderAuthState() {
  const user = state.user;
  const isOwner = user?.role === "owner";
  const isLogged = Boolean(user);

  adminPanel.classList.toggle("is-hidden", !isOwner);
  dashboardLink.classList.toggle("is-hidden", !isOwner);
  openLoginButton.classList.toggle("is-hidden", isLogged);
  authNavGroup.classList.toggle("is-hidden", !isLogged);
  memberArea.classList.toggle("is-hidden", !isLogged || isOwner);
  logoutButton.classList.toggle("is-hidden", !isOwner);
  adminStatus.textContent = isOwner ? "Conectado" : "Desconectado";

  if (isLogged) {
    userPill.textContent = user.role === "owner" ? "Proprietário" : user.name;
  }

  if (user && user.role !== "owner") {
    memberWelcome.textContent = `Bem-vindo, ${user.name}.`;
    memberDescription.textContent = "Sua conta foi criada com sucesso e já está conectada ao sistema da academia.";
    memberArea.classList.add("is-visible");
  }

  if (isOwner) {
    adminPanel.classList.add("is-visible");
  }
}

function switchAuthTab(tabName) {
  const isLogin = tabName === "login";
  loginForm.classList.toggle("is-hidden", !isLogin);
  registerForm.classList.toggle("is-hidden", isLogin);
  authTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.authTab === tabName));
  authFeedback.textContent = "";
}

function openModal() {
  authModal.hidden = false;
  document.body.classList.add("modal-open");
  switchAuthTab("login");
}

function closeModal() {
  authModal.hidden = true;
  document.body.classList.remove("modal-open");
  authFeedback.textContent = "";
}

function updateTopbarState() {
  const compact = window.scrollY > 24;
  const solid = hero ? window.scrollY > hero.offsetHeight - 180 : compact;
  topbar.classList.toggle("is-compact", compact);
  topbar.classList.toggle("is-solid", solid);
}

function setupSectionTracking() {
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visibleEntry) return;

      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${visibleEntry.target.id}`);
      });
    },
    {
      rootMargin: "-35% 0px -45% 0px",
      threshold: [0.2, 0.4, 0.6]
    }
  );

  sections.forEach((section) => observer.observe(section));
}

function setupRevealAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "same-origin",
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Erro na requisição.");
  }
  return data;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("pt-BR");
}




