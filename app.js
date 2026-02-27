const state = {
  user: null,
  plans: [],
  coaches: [],
  schedules: [],
  leads: [],
  users: []
};

const editing = {
  planId: null,
  coachId: null,
  scheduleId: null
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
const adminFeedback = document.getElementById("adminFeedback");
const adminPanel = document.getElementById("painel");
const adminStatus = document.getElementById("adminStatus");
const memberArea = document.getElementById("conta");
const memberWelcome = document.getElementById("memberWelcome");
const memberDescription = document.getElementById("memberDescription");
const memberDetails = document.getElementById("memberDetails");
const contactForm = document.getElementById("contactForm");
const navLinks = Array.from(document.querySelectorAll(".nav-links a"));
const revealNodes = document.querySelectorAll("[data-reveal]");
const authTabs = Array.from(document.querySelectorAll("[data-auth-tab]"));
const planForm = document.getElementById("planForm");
const coachForm = document.getElementById("coachForm");
const scheduleForm = document.getElementById("scheduleForm");

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

function setAdminFeedback(message, isSuccess = false) {
  if (!adminFeedback) return;
  adminFeedback.textContent = message;
  adminFeedback.classList.toggle("is-success", isSuccess);
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

function resetPlanForm() {
  editing.planId = null;
  planForm.reset();
  const button = planForm.querySelector('button[type="submit"]');
  button.dataset.defaultText = "Adicionar plano";
  button.textContent = "Adicionar plano";
}

function resetCoachForm() {
  editing.coachId = null;
  coachForm.reset();
  const button = coachForm.querySelector('button[type="submit"]');
  button.dataset.defaultText = "Adicionar coach";
  button.textContent = "Adicionar coach";
}

function resetScheduleForm() {
  editing.scheduleId = null;
  scheduleForm.reset();
  const button = scheduleForm.querySelector('button[type="submit"]');
  button.dataset.defaultText = "Adicionar horário";
  button.textContent = "Adicionar horário";
}

function startPlanEdit(plan) {
  editing.planId = plan.id;
  planForm.elements.name.value = plan.name;
  planForm.elements.price.value = plan.price;
  planForm.elements.description.value = plan.description;
  planForm.elements.featured.checked = Boolean(plan.featured);
  const button = planForm.querySelector('button[type="submit"]');
  button.dataset.defaultText = "Salvar plano";
  button.textContent = "Salvar plano";
  planForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startCoachEdit(coach) {
  editing.coachId = coach.id;
  coachForm.elements.name.value = coach.name;
  coachForm.elements.role.value = coach.role;
  const button = coachForm.querySelector('button[type="submit"]');
  button.dataset.defaultText = "Salvar coach";
  button.textContent = "Salvar coach";
  coachForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startScheduleEdit(schedule) {
  editing.scheduleId = schedule.id;
  scheduleForm.elements.day.value = schedule.day;
  scheduleForm.elements.hours.value = schedule.hours;
  scheduleForm.elements.details.value = schedule.details;
  const button = scheduleForm.querySelector('button[type="submit"]');
  button.dataset.defaultText = "Salvar horário";
  button.textContent = "Salvar horário";
  scheduleForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openAccountArea() {
  if (!state.user) {
    openModal();
    return;
  }

  const target = state.user.role === "owner" ? adminPanel : memberArea;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupUiEvents() {
  openLoginButton.addEventListener("click", openModal);
  userPill?.addEventListener("click", openAccountArea);
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
    const button = loginForm.querySelector('button[type="submit"]');
    const formData = new FormData(loginForm);
    setButtonLoading(button, true, "Entrando...");
    try {
      await submitAuth("/api/auth/login", {
        email: formData.get("email"),
        password: formData.get("password")
      });
    } finally {
      setButtonLoading(button, false, "Entrando...");
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = registerForm.querySelector('button[type="submit"]');
    const formData = new FormData(registerForm);
    setButtonLoading(button, true, "Criando...");
    try {
      await submitAuth("/api/auth/register", {
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password")
      });
    } finally {
      setButtonLoading(button, false, "Criando...");
    }
  });

  planForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(planForm);
    const button = planForm.querySelector('button[type="submit"]');
    const isEditing = Boolean(editing.planId);
    setButtonLoading(button, true, isEditing ? "Salvando..." : "Adicionando...");
    try {
      await apiFetch(isEditing ? `/api/admin/plans/${editing.planId}` : "/api/admin/plans", {
        method: isEditing ? "PUT" : "POST",
        body: {
          name: data.get("name"),
          price: data.get("price"),
          description: data.get("description"),
          featured: data.get("featured") === "on"
        }
      });
      resetPlanForm();
      await loadAdminDashboard();
      await loadPublicData();
      setAdminFeedback(isEditing ? "Plano atualizado com sucesso." : "Plano adicionado com sucesso.", true);
    } catch (error) {
      setAdminFeedback(error.message);
    } finally {
      setButtonLoading(button, false, isEditing ? "Salvando..." : "Adicionando...");
    }
  });

  coachForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(coachForm);
    const button = coachForm.querySelector('button[type="submit"]');
    const isEditing = Boolean(editing.coachId);
    setButtonLoading(button, true, isEditing ? "Salvando..." : "Adicionando...");
    try {
      await apiFetch(isEditing ? `/api/admin/coaches/${editing.coachId}` : "/api/admin/coaches", {
        method: isEditing ? "PUT" : "POST",
        body: {
          name: data.get("name"),
          role: data.get("role")
        }
      });
      resetCoachForm();
      await loadAdminDashboard();
      await loadPublicData();
      setAdminFeedback(isEditing ? "Coach atualizado com sucesso." : "Coach adicionado com sucesso.", true);
    } catch (error) {
      setAdminFeedback(error.message);
    } finally {
      setButtonLoading(button, false, isEditing ? "Salvando..." : "Adicionando...");
    }
  });

  scheduleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(scheduleForm);
    const button = scheduleForm.querySelector('button[type="submit"]');
    const isEditing = Boolean(editing.scheduleId);
    setButtonLoading(button, true, isEditing ? "Salvando..." : "Adicionando...");
    try {
      await apiFetch(isEditing ? `/api/admin/schedules/${editing.scheduleId}` : "/api/admin/schedules", {
        method: isEditing ? "PUT" : "POST",
        body: {
          day: data.get("day"),
          hours: data.get("hours"),
          details: data.get("details")
        }
      });
      resetScheduleForm();
      await loadAdminDashboard();
      await loadPublicData();
      setAdminFeedback(isEditing ? "Horário atualizado com sucesso." : "Horário adicionado com sucesso.", true);
    } catch (error) {
      setAdminFeedback(error.message);
    } finally {
      setButtonLoading(button, false, isEditing ? "Salvando..." : "Adicionando...");
    }
  });

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(contactForm);
    const button = contactForm.querySelector('button[type="submit"]');
    setButtonLoading(button, true, "Enviando...");
    try {
      await apiFetch("/api/leads", {
        method: "POST",
        body: {
          name: data.get("name"),
          email: data.get("email")
        }
      });
      contactForm.reset();
      if (state.user?.role === "owner") {
        await loadAdminDashboard();
      }
      authFeedback.textContent = "Contato enviado com sucesso.";
    } finally {
      setButtonLoading(button, false, "Enviando...");
    }
  });

  document.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-type][data-edit-id]");
    if (editButton) {
      const { editType, editId } = editButton.dataset;
      if (editType === "plan") {
        const plan = state.plans.find((item) => String(item.id) === editId);
        if (plan) startPlanEdit(plan);
      }
      if (editType === "coach") {
        const coach = state.coaches.find((item) => String(item.id) === editId);
        if (coach) startCoachEdit(coach);
      }
      if (editType === "schedule") {
        const schedule = state.schedules.find((item) => String(item.id) === editId);
        if (schedule) startScheduleEdit(schedule);
      }
      return;
    }

    const button = event.target.closest("[data-type][data-id]");
    if (!button) return;

    const { type, id } = button.dataset;
    const routeMap = {
      plan: `/api/admin/plans/${id}`,
      coach: `/api/admin/coaches/${id}`,
      schedule: `/api/admin/schedules/${id}`,
      lead: `/api/admin/leads/${id}`
    };

    setButtonLoading(button, true, "Removendo...");
    try {
      await apiFetch(routeMap[type], { method: "DELETE" });
      await loadAdminDashboard();
      if (type !== "lead") {
        await loadPublicData();
      }
      if (type === "plan" && editing.planId === Number(id)) resetPlanForm();
      if (type === "coach" && editing.coachId === Number(id)) resetCoachForm();
      if (type === "schedule" && editing.scheduleId === Number(id)) resetScheduleForm();
      setAdminFeedback("Item removido com sucesso.", true);
    } catch (error) {
      setAdminFeedback(error.message);
    } finally {
      setButtonLoading(button, false, "Removendo...");
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
    }
    openAccountArea();
  } catch (error) {
    authFeedback.textContent = error.message;
  }
}

async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.leads = [];
  state.users = [];
  setAdminFeedback("");
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
  state.users = data.users;
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
  const metricLeads = document.getElementById("metricLeads");
  const metricPlans = document.getElementById("metricPlans");
  const metricCoaches = document.getElementById("metricCoaches");
  const metricSchedules = document.getElementById("metricSchedules");
  const metricUsers = document.getElementById("metricUsers");

  if (metricLeads) metricLeads.textContent = String(state.leads.length);
  if (metricPlans) metricPlans.textContent = String(state.plans.length);
  if (metricCoaches) metricCoaches.textContent = String(state.coaches.length);
  if (metricSchedules) metricSchedules.textContent = String(state.schedules.length);
  if (metricUsers) metricUsers.textContent = String(state.users.length);

  renderCollection(
    state.plans,
    document.getElementById("planAdminList"),
    (plan) => `
      <div class="admin-item">
        <div>
          <strong>${plan.name}${plan.featured ? " · Destaque" : ""}</strong>
          <p>${plan.price} · ${plan.description}</p>
        </div>
        <div class="admin-item-actions">
          <button class="button secondary item-edit" type="button" data-edit-type="plan" data-edit-id="${plan.id}">Editar</button>
          <button class="button secondary item-delete" type="button" data-type="plan" data-id="${plan.id}">Remover</button>
        </div>
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
        <div class="admin-item-actions">
          <button class="button secondary item-edit" type="button" data-edit-type="coach" data-edit-id="${coach.id}">Editar</button>
          <button class="button secondary item-delete" type="button" data-type="coach" data-id="${coach.id}">Remover</button>
        </div>
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
        <div class="admin-item-actions">
          <button class="button secondary item-edit" type="button" data-edit-type="schedule" data-edit-id="${schedule.id}">Editar</button>
          <button class="button secondary item-delete" type="button" data-type="schedule" data-id="${schedule.id}">Remover</button>
        </div>
      </div>
    `,
    "Nenhum horário cadastrado."
  );

  renderCollection(
    state.users,
    document.getElementById("userList"),
    (user) => `
      <div class="admin-item user-item">
        <div>
          <strong>${user.name}</strong>
          <p>${user.email}</p>
        </div>
        <div class="user-list-meta">
          <span class="admin-status">${user.role === "owner" ? "Proprietário" : "Aluno"}</span>
          <p>Criado em ${formatDate(user.createdAt)}</p>
        </div>
      </div>
    `,
    "Nenhum usuário cadastrado ainda."
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

function renderMemberArea() {
  const user = state.user;
  if (!user || user.role === "owner") {
    memberArea.classList.add("is-hidden");
    if (memberDetails) {
      memberDetails.innerHTML = "";
    }
    return;
  }

  memberArea.classList.remove("is-hidden");
  memberArea.classList.add("is-visible");
  memberWelcome.textContent = `Bem-vindo, ${user.name}.`;
  memberDescription.textContent = "Sua conta está ativa. Use esta área para acompanhar seu acesso e manter seus dados de cadastro em dia.";
  memberDetails.innerHTML = `
    <div class="member-detail-row"><span>Nome</span><strong>${user.name}</strong></div>
    <div class="member-detail-row"><span>E-mail</span><strong>${user.email}</strong></div>
    <div class="member-detail-row"><span>Perfil</span><strong>${user.role === "owner" ? "Proprietário" : "Aluno"}</strong></div>
    <div class="member-detail-row"><span>Status</span><strong>Conta ativa</strong></div>
  `;
}

function renderAuthState() {
  const user = state.user;
  const isOwner = user?.role === "owner";
  const isLogged = Boolean(user);

  adminPanel.classList.toggle("is-hidden", !isOwner);
  dashboardLink.classList.toggle("is-hidden", !isOwner);
  openLoginButton.classList.toggle("is-hidden", isLogged);
  authNavGroup.classList.toggle("is-hidden", !isLogged);
  logoutButton.classList.toggle("is-hidden", !isOwner);
  adminStatus.textContent = isOwner ? "Conectado" : "Desconectado";

  if (isLogged) {
    userPill.textContent = user.role === "owner" ? "Proprietário" : user.name;
    userPill.title = isOwner ? "Ir para o painel do proprietário" : "Abrir gerenciamento da conta";
  }

  if (isOwner) {
    adminPanel.classList.add("is-visible");
  }

  renderMemberArea();
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
