const $ = (id) => document.getElementById(id);
let currentUser = null, medicines = [], cart = [], authMode = "login", toastTimer;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}
function money(value) { return "₹" + Number(value).toFixed(2); }
function showToast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function setUser(user) {
  currentUser = user;
  $("welcome").textContent = user ? `Hi, ${user.name.split(" ")[0]}` : "";
  $("authBtn").classList.toggle("hidden", !!user);
  $("logoutBtn").classList.toggle("hidden", !user);
  $("ordersNav").classList.toggle("hidden", !user || user.role === "admin");
  $("accountArea").classList.toggle("hidden", !user || user.role === "admin");
  $("adminArea").classList.toggle("hidden", !user || user.role !== "admin");
  if (user?.role === "admin") loadAdmin();
  if (user && user.role !== "admin") loadMyOrders();
}
async function loadMedicines() {
  try {
    medicines = await api("/api/medicines?q=" + encodeURIComponent($("searchInput").value));
    const categories = [...new Set(medicines.map(m => m.category))].sort();
    const selected = $("categoryFilter").value;
    $("categoryFilter").innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    $("categoryFilter").value = selected;
    renderMedicines();
  } catch (e) { $("medicineGrid").innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; }
}
function renderMedicines() {
  const category = $("categoryFilter").value;
  const list = medicines.filter(m => !category || m.category === category);
  $("catalogCount").textContent = `${list.length} ${list.length === 1 ? "medicine" : "medicines"} available`;
  $("medicineGrid").innerHTML = list.length ? list.map(m => {
    const expired = m.expiry_date < new Date().toISOString().slice(0,10);
    const available = Number(m.stock) > 0 && !expired;
    return `<article class="medicine-card-item">
      <div class="medicine-visual"><span class="med-symbol">✚</span></div>
      <span class="category-chip">${escapeHtml(m.category)}</span>
      <h3>${escapeHtml(m.medicine_name)}</h3><div class="manufacturer">${escapeHtml(m.manufacturer || "Trusted manufacturer")}</div>
      <div class="med-meta"><span class="price">${money(m.price)}</span><span class="stock ${available ? "" : "out"}">${expired ? "Expired" : available ? `${m.stock} in stock` : "Out of stock"}</span></div>
      <button class="card-add" data-add="${m.medicine_id}" ${available ? "" : "disabled"}>${available ? "＋ Add to cart" : "Currently unavailable"}</button>
    </article>`;
  }).join("") : '<div class="empty-state">No medicines match your search. Try another name or category.</div>';
}
function updateCart() {
  $("cartCount").textContent = cart.reduce((n, x) => n + x.quantity, 0);
  $("cartTotal").textContent = money(cart.reduce((n, x) => n + x.price * x.quantity, 0));
  $("cartItems").innerHTML = cart.length ? cart.map(item => `<div class="cart-row"><div><h4>${escapeHtml(item.medicine_name)}</h4><small>${money(item.price)} each</small><div class="qty-controls"><button data-qty="${item.medicine_id}" data-change="-1">−</button><b>${item.quantity}</b><button data-qty="${item.medicine_id}" data-change="1">+</button></div></div><b>${money(item.price * item.quantity)}</b></div>`).join("") : '<div class="empty-state">Your cart is empty.<br>Browse the catalogue to add medicines.</div>';
  $("checkoutBtn").disabled = !cart.length;
}
function addToCart(id) {
  const med = medicines.find(m => Number(m.medicine_id) === Number(id));
  if (!med) return;
  const item = cart.find(x => x.medicine_id === med.medicine_id);
  if (item) {
    if (item.quantity >= med.stock) return showToast("You have reached the available stock limit.");
    item.quantity++;
  } else cart.push({ medicine_id: med.medicine_id, medicine_name: med.medicine_name, price: Number(med.price), quantity: 1, stock: Number(med.stock) });
  updateCart(); showToast("Added to your cart.");
}
function changeQty(id, change) {
  const item = cart.find(x => x.medicine_id === Number(id));
  if (!item) return;
  item.quantity += Number(change);
  if (item.quantity < 1) cart = cart.filter(x => x.medicine_id !== Number(id));
  if (item.quantity > item.stock) { item.quantity = item.stock; showToast("Available stock limit reached."); }
  updateCart();
}
function openCart() { $("overlay").classList.remove("hidden"); $("cartDrawer").classList.add("open"); }
function closeCart() { $("overlay").classList.add("hidden"); $("cartDrawer").classList.remove("open"); }
function openAuth(mode = "login") {
  setAuthMode(mode); $("authModal").classList.remove("hidden"); $("authMessage").textContent = "";
}
function closeAuth() { $("authModal").classList.add("hidden"); }
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".auth-tabs button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  $("authTitle").textContent = mode === "login" ? "Welcome back." : "Create your account.";
  $("authSubtitle").textContent = mode === "login" ? "Log in to manage your orders." : "Join us for a simpler way to order.";
  $("nameField").classList.toggle("hidden", mode !== "register");
  $("phoneField").classList.toggle("hidden", mode !== "register");
  $("authName").required = mode === "register";
  $("authSubmit").textContent = mode === "login" ? "Login" : "Create account";
}
async function loadMyOrders() {
  try {
    const rows = await api("/api/orders/mine");
    $("myOrders").innerHTML = rows.length ? rows.map(o => `<article class="order-card"><div><h4>Order #${o.order_id}</h4><p>${escapeHtml(o.items)} · ${String(o.order_date).slice(0,10)}</p></div><div class="order-right"><b>${money(o.total_amount)}</b><span class="status">${escapeHtml(o.status)}</span></div></article>`).join("") : '<div class="empty-state">You have not placed any orders yet.</div>';
  } catch (e) { $("myOrders").innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; }
}
async function loadAdmin() {
  try {
    const s = await api("/api/admin/summary");
    $("stats").innerHTML = [
      ["Medicine types", s.medicine_count], ["Units in stock", s.units],
      ["Total orders", s.order_count], ["Expiring within 90 days", s.expiring_count]
    ].map(([label, value]) => `<div class="stat-card"><small>${label}</small><b>${Number(value).toLocaleString("en-IN")}</b></div>`).join("");
    renderInventory(); renderAdminOrders();
  } catch (e) { showToast(e.message); }
}
async function renderInventory() {
  try {
    const rows = await api("/api/medicines");
    $("inventoryTable").innerHTML = `<table><thead><tr><th>Medicine</th><th>Stock</th><th>Expiry</th><th>Price</th><th>Actions</th></tr></thead><tbody>${rows.map(m => {
      const warning = m.expiry_date <= new Date(Date.now() + 90*86400000).toISOString().slice(0,10);
      return `<tr><td><b>${escapeHtml(m.medicine_name)}</b><br><small>${escapeHtml(m.category)}</small></td><td>${m.stock}</td><td class="${warning ? "expiry-warning" : ""}">${String(m.expiry_date).slice(0,10)}</td><td>${money(m.price)}</td><td><button class="table-action" data-edit="${m.medicine_id}">Edit</button><button class="table-action danger" data-delete="${m.medicine_id}">Delete</button></td></tr>`;
    }).join("")}</tbody></table>`;
  } catch (e) { $("inventoryTable").textContent = e.message; }
}
async function renderAdminOrders() {
  try {
    const rows = await api("/api/admin/orders");
    $("adminOrders").innerHTML = rows.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows.map(o => `<tr><td>#${o.order_id}<br><small>${String(o.order_date).slice(0,10)}</small></td><td>${escapeHtml(o.name)}<br><small>${escapeHtml(o.email)}</small></td><td>${escapeHtml(o.items)}</td><td>${money(o.total_amount)}</td><td><select data-status="${o.order_id}">${["Pending","Confirmed","Shipped","Delivered","Cancelled"].map(st => `<option ${st === o.status ? "selected" : ""}>${st}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">No customer orders yet.</div>';
  } catch (e) { $("adminOrders").textContent = e.message; }
}
function resetMedicineForm() {
  $("medicineForm").reset(); $("medicineId").value = ""; $("formTitle").textContent = "Add a medicine"; $("saveMedicine").textContent = "Save medicine";
}
async function editMedicine(id) {
  const m = medicines.find(x => Number(x.medicine_id) === Number(id)) || (await api("/api/medicines")).find(x => Number(x.medicine_id) === Number(id));
  if (!m) return;
  $("medicineId").value = m.medicine_id; $("medName").value = m.medicine_name; $("medCategory").value = m.category;
  $("medManufacturer").value = m.manufacturer || ""; $("medPrice").value = m.price; $("medStock").value = m.stock; $("medExpiry").value = String(m.expiry_date).slice(0,10);
  $("formTitle").textContent = "Update medicine"; $("saveMedicine").textContent = "Update medicine";
  $("medicineForm").scrollIntoView({ behavior: "smooth", block: "center" });
}
document.addEventListener("click", async e => {
  const add = e.target.closest("[data-add]"); if (add) addToCart(add.dataset.add);
  const qty = e.target.closest("[data-qty]"); if (qty) changeQty(qty.dataset.qty, qty.dataset.change);
  const edit = e.target.closest("[data-edit]"); if (edit) editMedicine(edit.dataset.edit);
  const del = e.target.closest("[data-delete]");
  if (del && confirm("Delete this medicine from the catalogue?")) {
    try { await api(`/api/medicines/${del.dataset.delete}`, { method: "DELETE" }); showToast("Medicine deleted."); await loadMedicines(); await renderInventory(); }
    catch (err) { showToast(err.message); }
  }
});
$("searchInput").addEventListener("input", loadMedicines);
$("categoryFilter").addEventListener("change", renderMedicines);
$("clearSearch").addEventListener("click", () => { $("searchInput").value = ""; $("categoryFilter").value = ""; loadMedicines(); });
$("cartButton").addEventListener("click", openCart);
$("closeCart").addEventListener("click", closeCart);
$("overlay").addEventListener("click", closeCart);
$("authBtn").addEventListener("click", () => openAuth());
$("closeAuth").addEventListener("click", closeAuth);
document.querySelectorAll(".auth-tabs button").forEach(b => b.addEventListener("click", () => setAuthMode(b.dataset.mode)));
$("ordersNav").addEventListener("click", () => $("accountArea").scrollIntoView({ behavior: "smooth" }));
$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); setUser(null); showToast("You have logged out."); }
  catch (e) { showToast(e.message); }
});
$("authForm").addEventListener("submit", async e => {
  e.preventDefault(); $("authMessage").textContent = "";
  const body = { email: $("authEmail").value, password: $("authPassword").value };
  if (authMode === "register") Object.assign(body, { name: $("authName").value, phone: $("authPhone").value });
  try {
    const result = await api(`/api/${authMode}`, { method: "POST", body: JSON.stringify(body) });
    setUser(result.user); closeAuth(); $("authForm").reset(); showToast(result.message);
  } catch (err) { $("authMessage").textContent = err.message; }
});
$("checkoutBtn").addEventListener("click", async () => {
  if (!currentUser) { closeCart(); return openAuth(); }
  try {
    const result = await api("/api/orders", { method: "POST", body: JSON.stringify({ items: cart.map(x => ({ medicine_id: x.medicine_id, quantity: x.quantity })) }) });
    cart = []; updateCart(); closeCart(); showToast(`Order #${result.order_id} placed successfully.`);
    await loadMedicines(); if (currentUser.role === "admin") await loadAdmin(); else await loadMyOrders();
  } catch (e) { showToast(e.message); }
});
$("medicineForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("medicineId").value;
  const body = { medicine_name: $("medName").value.trim(), category: $("medCategory").value.trim(), manufacturer: $("medManufacturer").value.trim(), price: Number($("medPrice").value), stock: Number($("medStock").value), expiry_date: $("medExpiry").value };
  try {
    await api(id ? `/api/medicines/${id}` : "/api/medicines", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
    resetMedicineForm(); showToast(id ? "Medicine updated." : "Medicine added."); await loadMedicines(); await renderInventory();
  } catch (err) { showToast(err.message); }
});
$("cancelEdit").addEventListener("click", resetMedicineForm);
$("adminOrders").addEventListener("change", async e => {
  if (!e.target.matches("[data-status]")) return;
  try { await api(`/api/admin/orders/${e.target.dataset.status}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }); showToast("Order status updated."); }
  catch (err) { showToast(err.message); }
});
$("year").textContent = new Date().getFullYear();
(async function init() {
  updateCart(); await loadMedicines();
  try { const s = await api("/api/session"); setUser(s.user); } catch { setUser(null); }
})();
