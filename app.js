/* global localStorage */

const STORAGE_KEY = "pos_restaurante_pedidos_v1";
const RECIPES_KEY = "pos_restaurante_recetas_v1";
const moneyFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`No se encontró el elemento: ${sel}`);
  return el;
}

function uid() {
  return `P-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function nowISO() {
  return new Date().toISOString();
}

function parsePrice(input) {
  const s = String(input ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100) / 100;
}

function safeText(s) {
  return String(s ?? "").trim();
}

function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function calcTotal(items) {
  return items.reduce((acc, it) => acc + it.qty * it.price, 0);
}

function itemCount(items) {
  return items.reduce((acc, it) => acc + it.qty, 0);
}

function setStatusBadge(status) {
  const badge = $("#orderStatus");
  badge.classList.remove("badge--open", "badge--paid", "badge--cancelled");
  if (status === "paid") {
    badge.textContent = "Pagado";
    badge.classList.add("badge--paid");
  } else if (status === "cancelled") {
    badge.textContent = "Cancelado";
    badge.classList.add("badge--cancelled");
  } else {
    badge.textContent = "Abierto";
    badge.classList.add("badge--open");
  }
}

function showDialog(title, body) {
  const dlg = $("#dialog");
  $("#dialogTitle").textContent = title;
  $("#dialogBody").textContent = body;
  if (typeof dlg.showModal === "function") dlg.showModal();
  else alert(`${title}\n\n${body}`);
}

function categoryLabel(cat) {
  if (cat === "comida") return "Comida";
  if (cat === "bebida") return "Bebida";
  if (cat === "postre") return "Postre";
  return "Otro";
}

const DEFAULT_RECIPES = [
  { id: "c1", name: "Sashimi mixto", price: 9500, cat: "comida" },
  { id: "c2", name: "Roll Philadelphia (8 piezas)", price: 8200, cat: "comida" },
  { id: "c3", name: "Roll Buenos Aires (8 piezas)", price: 8400, cat: "comida" },
  { id: "c4", name: "Nigiri salmón (2 piezas)", price: 3600, cat: "comida" },
  { id: "c5", name: "Tabla degustación (24 piezas)", price: 18500, cat: "comida" },
  { id: "b1", name: "Agua", price: 1500, cat: "bebida" },
  { id: "b2", name: "Gaseosa", price: 2200, cat: "bebida" },
  { id: "b3", name: "Cerveza", price: 3800, cat: "bebida" },
  { id: "p1", name: "Helado de té verde", price: 3800, cat: "postre" },
  { id: "p2", name: "Mochi (2 unidades)", price: 4200, cat: "postre" },
];

function loadRecipes() {
  try {
    const raw = localStorage.getItem(RECIPES_KEY);
    if (!raw) return structuredClone(DEFAULT_RECIPES);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return structuredClone(DEFAULT_RECIPES);
    return parsed;
  } catch {
    return structuredClone(DEFAULT_RECIPES);
  }
}

function saveRecipes(recipes) {
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
}

let activeCat = "all";
let menuQuery = "";
let recipes = loadRecipes();
let recipeEditingId = null;

let currentOrder = {
  id: uid(),
  status: "open", // open | paid | cancelled
  createdAt: nowISO(),
  updatedAt: nowISO(),
  mesa: "",
  cliente: "",
  notas: "",
  items: [],
};

function newOrder() {
  currentOrder = {
    id: uid(),
    status: "open",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    mesa: "",
    cliente: "",
    notas: "",
    items: [],
  };
  $("#mesa").value = "";
  $("#cliente").value = "";
  $("#notas").value = "";
  $("#orderId").textContent = currentOrder.id;
  setStatusBadge(currentOrder.status);
  renderOrder();
}

function upsertItem({ name, price }) {
  if (currentOrder.status !== "open") {
    showDialog("Pedido no editable", "Solo podés modificar pedidos en estado Abierto.");
    return;
  }
  const idx = currentOrder.items.findIndex((x) => x.name === name && x.price === price);
  if (idx >= 0) currentOrder.items[idx].qty += 1;
  else currentOrder.items.push({ name, price, qty: 1 });
  currentOrder.updatedAt = nowISO();
  renderOrder();
}

function changeQty(index, delta) {
  if (currentOrder.status !== "open") return;
  const it = currentOrder.items[index];
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) currentOrder.items.splice(index, 1);
  currentOrder.updatedAt = nowISO();
  renderOrder();
}

function removeItem(index) {
  if (currentOrder.status !== "open") return;
  currentOrder.items.splice(index, 1);
  currentOrder.updatedAt = nowISO();
  renderOrder();
}

function captureMeta() {
  currentOrder.mesa = safeText($("#mesa").value);
  currentOrder.cliente = safeText($("#cliente").value);
  currentOrder.notas = safeText($("#notas").value);
  currentOrder.updatedAt = nowISO();
}

function validateOrderForSave() {
  captureMeta();
  if (currentOrder.items.length === 0) {
    showDialog("Falta info", "Agregá al menos un ítem al pedido.");
    return false;
  }
  if (!currentOrder.mesa) {
    showDialog("Falta info", "Ingresá la mesa (por ejemplo: 5).");
    return false;
  }
  return true;
}

function saveCurrentOrder() {
  if (!validateOrderForSave()) return;
  const orders = loadOrders();
  const idx = orders.findIndex((o) => o.id === currentOrder.id);
  const snapshot = structuredClone(currentOrder);
  if (idx >= 0) orders[idx] = snapshot;
  else orders.unshift(snapshot);
  saveOrders(orders);
  renderSaved();
  showDialog("Guardado", `Pedido ${currentOrder.id} guardado.`);
}

function setCurrentStatus(status) {
  if (status !== "open" && status !== "paid" && status !== "cancelled") return;
  captureMeta();
  currentOrder.status = status;
  currentOrder.updatedAt = nowISO();
  setStatusBadge(currentOrder.status);
  renderOrder();
}

function persistCurrentStatus() {
  const orders = loadOrders();
  const idx = orders.findIndex((o) => o.id === currentOrder.id);
  if (idx < 0) {
    showDialog("No guardado", "Primero guardá el pedido para cambiar su estado.");
    return;
  }
  orders[idx] = structuredClone(currentOrder);
  saveOrders(orders);
  renderSaved();
}

function loadIntoCurrent(orderId) {
  const orders = loadOrders();
  const found = orders.find((o) => o.id === orderId);
  if (!found) return;
  currentOrder = structuredClone(found);
  $("#mesa").value = currentOrder.mesa ?? "";
  $("#cliente").value = currentOrder.cliente ?? "";
  $("#notas").value = currentOrder.notas ?? "";
  $("#orderId").textContent = currentOrder.id;
  setStatusBadge(currentOrder.status);
  renderOrder();
}

function deleteOrder(orderId) {
  const orders = loadOrders().filter((o) => o.id !== orderId);
  saveOrders(orders);
  renderSaved();
}

function clearAllOrders() {
  saveOrders([]);
  renderSaved();
  renderKPIs();
  showDialog("Listo", "Se borraron todos los pedidos guardados.");
}

function renderMenu() {
  const grid = $("#menuGrid");
  grid.innerHTML = "";

  const q = menuQuery.toLowerCase();
  const filtered = recipes
    .filter((p) => (activeCat === "all" ? true : p.cat === activeCat))
    .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.padding = "4px 2px";
    empty.textContent = "No hay resultados.";
    grid.appendChild(empty);
    return;
  }

  for (const p of filtered) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "menuItem";
    card.addEventListener("click", () => upsertItem({ name: p.name, price: p.price }));

    const left = document.createElement("div");
    const name = document.createElement("div");
    name.className = "menuItem__name";
    name.textContent = p.name;
    const meta = document.createElement("div");
    meta.className = "menuItem__meta";
    meta.textContent = categoryLabel(p.cat);
    left.appendChild(name);
    left.appendChild(meta);

    const price = document.createElement("div");
    price.className = "menuItem__price";
    price.textContent = moneyFmt.format(p.price);

    card.appendChild(left);
    card.appendChild(price);
    grid.appendChild(card);
  }
}

function resetRecipeForm() {
  recipeEditingId = null;
  $("#recipeName").value = "";
  $("#recipePrice").value = "";
  $("#recipeCat").value = "comida";
}

function saveRecipeFromForm() {
  const name = safeText($("#recipeName").value);
  const price = parsePrice($("#recipePrice").value);
  const cat = $("#recipeCat").value;
  if (!name) {
    showDialog("Falta info", "Ingresá el nombre de la receta.");
    return;
  }
  if (price == null || price <= 0) {
    showDialog("Falta info", "Ingresá un precio válido para la receta.");
    return;
  }
  if (!["comida", "bebida", "postre"].includes(cat)) {
    showDialog("Falta info", "Seleccioná una categoría válida.");
    return;
  }

  if (recipeEditingId) {
    recipes = recipes.map((r) => (r.id === recipeEditingId ? { ...r, name, price, cat } : r));
  } else {
    recipes.unshift({ id: uid(), name, price, cat });
  }

  saveRecipes(recipes);
  resetRecipeForm();
  renderRecipes();
  renderMenu();
  renderKPIs();
}

function editRecipe(recipeId) {
  const found = recipes.find((r) => r.id === recipeId);
  if (!found) return;
  recipeEditingId = recipeId;
  $("#recipeName").value = found.name;
  $("#recipePrice").value = String(found.price);
  $("#recipeCat").value = found.cat;
}

function deleteRecipe(recipeId) {
  recipes = recipes.filter((r) => r.id !== recipeId);
  saveRecipes(recipes);
  if (recipeEditingId === recipeId) resetRecipeForm();
  renderRecipes();
  renderMenu();
  renderKPIs();
}

function renderRecipes() {
  const list = $("#recipesList");
  list.innerHTML = "";

  if (recipes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No hay recetas cargadas.";
    list.appendChild(empty);
    return;
  }

  recipes.forEach((r) => {
    const row = document.createElement("div");
    row.className = "recipeRow";

    const name = document.createElement("div");
    name.className = "recipeRow__name";
    name.textContent = r.name;

    const meta = document.createElement("div");
    meta.className = "recipeRow__meta";
    meta.textContent = `${categoryLabel(r.cat)} • ${moneyFmt.format(r.price)}`;

    const info = document.createElement("div");
    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "recipeRow__actions";

    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "btn btn--ghost";
    btnEdit.textContent = "Editar";
    btnEdit.addEventListener("click", () => editRecipe(r.id));

    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "btn btn--ghost";
    btnDelete.textContent = "Eliminar";
    btnDelete.addEventListener("click", () => deleteRecipe(r.id));

    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);

    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function renderOrder() {
  $("#orderId").textContent = currentOrder.id;
  setStatusBadge(currentOrder.status);

  const list = $("#orderList");
  list.innerHTML = "";

  if (currentOrder.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Agregá productos desde el menú para empezar.";
    list.appendChild(empty);
  }

  currentOrder.items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "orderRow";

    const name = document.createElement("div");
    name.className = "orderRow__name";
    name.textContent = it.name;

    const qty = document.createElement("div");
    qty.className = "qty";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.title = "Restar";
    minus.addEventListener("click", () => changeQty(idx, -1));
    const val = document.createElement("div");
    val.className = "qty__val";
    val.textContent = String(it.qty);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.title = "Sumar";
    plus.addEventListener("click", () => changeQty(idx, +1));
    qty.appendChild(minus);
    qty.appendChild(val);
    qty.appendChild(plus);

    const price = document.createElement("div");
    price.className = "money right";
    price.textContent = moneyFmt.format(it.price);

    const subtotal = document.createElement("div");
    subtotal.className = "money right";
    subtotal.textContent = moneyFmt.format(it.qty * it.price);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "iconBtn";
    del.title = "Eliminar ítem";
    del.textContent = "×";
    del.addEventListener("click", () => removeItem(idx));

    row.appendChild(name);
    row.appendChild(qty);
    row.appendChild(price);
    row.appendChild(subtotal);
    row.appendChild(del);
    list.appendChild(row);
  });

  const total = calcTotal(currentOrder.items);
  $("#totalAmount").textContent = moneyFmt.format(total);
  $("#itemsCount").textContent = String(itemCount(currentOrder.items));

  const canEdit = currentOrder.status === "open";
  $("#btnPay").disabled = currentOrder.items.length === 0;
  $("#btnSave").disabled = !canEdit && !loadOrders().some((o) => o.id === currentOrder.id);
  $("#btnCancel").disabled = currentOrder.items.length === 0;
}

function formatShortDate(iso) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch {
    return "";
  }
}

function renderSaved() {
  const list = $("#savedList");
  list.innerHTML = "";

  const statusFilter = $("#filterStatus").value;
  const q = safeText($("#savedSearch").value).toLowerCase();
  const orders = loadOrders()
    .filter((o) => (statusFilter === "all" ? true : o.status === statusFilter))
    .filter((o) => {
      if (!q) return true;
      const hay = `${o.mesa ?? ""} ${o.cliente ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  if (orders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Todavía no hay pedidos guardados.";
    list.appendChild(empty);
    renderKPIs();
    return;
  }

  for (const o of orders) {
    const card = document.createElement("div");
    card.className = "savedCard";

    const top = document.createElement("div");
    top.className = "savedCard__top";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "savedCard__title";
    title.textContent = `Mesa ${o.mesa || "?"}${o.cliente ? ` • ${o.cliente}` : ""}`;
    const meta = document.createElement("div");
    meta.className = "savedCard__meta";
    meta.textContent = `${o.id} • ${formatShortDate(o.createdAt)} • ${o.status}`;
    left.appendChild(title);
    left.appendChild(meta);

    const money = document.createElement("div");
    money.className = "savedCard__money";
    money.textContent = moneyFmt.format(calcTotal(o.items || []));

    top.appendChild(left);
    top.appendChild(money);

    const actions = document.createElement("div");
    actions.className = "savedCard__actions";

    const btnLoad = document.createElement("button");
    btnLoad.type = "button";
    btnLoad.className = "btn btn--secondary";
    btnLoad.textContent = "Abrir";
    btnLoad.addEventListener("click", () => loadIntoCurrent(o.id));

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn btn--ghost";
    btnDel.textContent = "Eliminar";
    btnDel.addEventListener("click", () => deleteOrder(o.id));

    actions.appendChild(btnLoad);
    actions.appendChild(btnDel);

    card.appendChild(top);
    card.appendChild(actions);
    list.appendChild(card);
  }

  renderKPIs();
}

function renderKPIs() {
  const orders = loadOrders();
  const paidTotal = orders
    .filter((o) => o.status === "paid")
    .reduce((acc, o) => acc + calcTotal(o.items || []), 0);
  $("#kpiOrders").textContent = String(orders.length);
  $("#kpiRecipes").textContent = String(recipes.length);
  $("#kpiPaid").textContent = moneyFmt.format(paidTotal);
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("tab--active"));
      btn.classList.add("tab--active");
      activeCat = btn.dataset.cat || "all";
      renderMenu();
    });
  });
}

function initEvents() {
  $("#btnNew").addEventListener("click", () => newOrder());
  $("#btnSave").addEventListener("click", () => saveCurrentOrder());

  $("#btnPay").addEventListener("click", () => {
    if (currentOrder.items.length === 0) return;
    setCurrentStatus("paid");
    persistCurrentStatus();
  });
  $("#btnCancel").addEventListener("click", () => {
    if (currentOrder.items.length === 0) return;
    setCurrentStatus("cancelled");
    persistCurrentStatus();
  });

  $("#menuSearch").addEventListener("input", (e) => {
    menuQuery = e.target.value || "";
    renderMenu();
  });

  $("#filterStatus").addEventListener("change", () => renderSaved());
  $("#savedSearch").addEventListener("input", () => renderSaved());

  $("#btnClearAll").addEventListener("click", () => clearAllOrders());
  $("#btnRecipeSave").addEventListener("click", () => saveRecipeFromForm());
  $("#btnRecipeCancel").addEventListener("click", () => resetRecipeForm());

  ["mesa", "cliente", "notas"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      captureMeta();
    });
  });
}

function boot() {
  initTabs();
  initEvents();
  renderRecipes();
  renderMenu();
  newOrder();
  renderSaved();
  renderKPIs();
}

boot();
