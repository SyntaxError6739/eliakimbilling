const money = (usd) => `USD ${Number(usd || 0).toFixed(2)}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

async function adminApi(path, options = {}) {
  const csrfToken = document.cookie.match(/(?:^|; )somalinet_csrf=([^;]+)/)?.[1] || '';
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}), ...(options.headers || {}) };
  const response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', headers });
  if (response.status === 401 || response.status === 403) {
    window.location.href = '/admin/login';
    throw new Error('Your administrator session has ended.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load admin data');
  return data;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = busy ? 'Checking...' : label;
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  const error = document.getElementById('login-error');
  const submit = document.getElementById('login-submit');
  error.textContent = '';
  if (!email || !email.includes('@') || password.length < 12) {
    error.textContent = 'Enter a valid email and a password of at least 12 characters.';
    return;
  }
  setBusy(submit, true, 'Sign in ->');
  try {
    const result = await fetch('/api/auth/admin-login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error || 'Unable to sign in');
    window.location.href = '/admin/dashboard';
  } catch (loginError) {
    error.textContent = loginError.message;
    setBusy(submit, false, 'Sign in ->');
  }
}

function renderTable(target, headers, rows) {
  const element = document.getElementById(target);
  if (!element) return;
  element.innerHTML = rows.length ? `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="empty">No records found.</p>';
}

function showSection(section) {
  document.querySelectorAll('.dashboard-section').forEach((element) => element.classList.toggle('active-section', element.id === `section-${section}`));
  document.querySelectorAll('.nav-item').forEach((element) => element.classList.toggle('active', element.dataset.section === section));
  const title = document.getElementById('section-title');
  if (title) title.textContent = document.querySelector(`[data-section="${section}"]`)?.textContent || 'Overview';
  loadSection(section).catch((error) => { document.getElementById('dashboard-error').textContent = error.message; });
}

async function loadOverview() {
  const [overview, revenue, sessions] = await Promise.all([adminApi('/admin/overview'), adminApi('/admin/revenue?period=today'), adminApi('/admin/sessions')]);
  document.getElementById('metric-revenue').textContent = money(overview.revenueUSD);
  document.getElementById('metric-transactions').textContent = overview.transactions;
  document.getElementById('metric-sessions').textContent = overview.activeSessions;
  document.getElementById('metric-customers').textContent = overview.customers;
  document.getElementById('last-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  renderTable('overview-sessions', ['Customer', 'Plan', 'Started', 'Expires'], sessions.sessions.slice(0, 6).map((item) => `<tr><td>${escapeHtml(item.user_name || item.phone)}</td><td>${escapeHtml(item.plan_name)}</td><td>${new Date(item.started_at).toLocaleTimeString()}</td><td>${new Date(item.expires_at).toLocaleTimeString()}</td></tr>`));
  const mix = document.getElementById('plan-mix');
  const max = Math.max(...revenue.byPlan.map((item) => Number(item.revenue)), 1);
  mix.innerHTML = revenue.byPlan.length ? revenue.byPlan.map((item) => `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(item.plan)}</span><strong>${money(item.revenue)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${(Number(item.revenue) / max) * 100}%"></div></div></div>`).join('') : '<p class="empty">No confirmed payments today.</p>';
}

async function loadSection(section) {
  if (section === 'overview') return loadOverview();
  if (section === 'customers') {
    const search = new URLSearchParams(new FormData(document.getElementById('customer-search-form'))).get('search') || '';
    const [data, plans] = await Promise.all([adminApi(`/admin/users?page=1&search=${encodeURIComponent(search)}`), adminApi('/admin/plans')]);
    renderTable('customers-table', ['Name', 'Phone', 'Email', 'Status', 'Package assignment', 'Actions'], data.users.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.phone)}</td><td>${escapeHtml(item.email || '-')}</td><td>${item.suspended ? 'Suspended' : 'Active'}</td><td><select data-assign-customer="${item.id}"><option value="">Choose package</option>${plans.plans.filter((plan) => plan.active).map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`).join('')}</select></td><td><button type="button" data-toggle-customer="${item.id}" data-suspended="${item.suspended}">${item.suspended ? 'Reinstate' : 'Suspend'}</button></td></tr>`));
  }
  if (section === 'plans') { const data = await adminApi('/admin/plans'); renderTable('plans-table', ['Package', 'Description', 'Duration', 'Price', 'Status', 'Actions'], data.plans.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.description || '')}</td><td>${item.duration_h} hours</td><td>${escapeHtml(item.currency)} ${money(item.price_usd).replace('USD ', '')}</td><td>${item.active ? 'Active' : 'Inactive'}</td><td><button type="button" data-edit-plan="${item.id}">Edit</button> <button type="button" data-toggle-plan="${item.id}" data-active="${item.active}">${item.active ? 'Deactivate' : 'Activate'}</button></td></tr>`)); }
  if (section === 'payments') { const data = await adminApi('/admin/payments'); renderTable('payments-table', ['Customer', 'Package', 'Provider', 'Amount', 'Status', 'Created'], data.payments.map((item) => `<tr><td>${escapeHtml(item.user_name || item.phone)}</td><td>${escapeHtml(item.plan_name || '-')}</td><td>${escapeHtml(item.provider)}</td><td>${money(item.amount_usd)}</td><td class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</td><td>${new Date(item.created_at).toLocaleString()}</td></tr>`)); }
  if (section === 'sessions') { const data = await adminApi('/admin/sessions'); renderTable('sessions-table', ['Customer', 'Plan', 'IP', 'Device', 'Expires'], data.sessions.map((item) => `<tr><td>${escapeHtml(item.user_name || item.phone)}</td><td>${escapeHtml(item.plan_name)}</td><td>${escapeHtml(item.ip_address || '-')}</td><td>${escapeHtml(item.mac_address || '-')}</td><td>${new Date(item.expires_at).toLocaleString()}</td></tr>`)); }
  if (section === 'reports') { const [admins, audit] = await Promise.all([adminApi('/admin/administrators'), adminApi('/admin/audit')]); renderTable('admins-table', ['Name', 'Email', 'Phone', 'Actions'], admins.administrators.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.phone)}</td><td>${item.is_original_admin ? 'Original admin' : `<button type="button" data-select-admin="${item.id}">Select for removal</button>`}</td></tr>`)); document.getElementById('audit-table').innerHTML = audit.entries.length ? audit.entries.map((item) => `<div class="audit-item"><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.admin_name)}</span><small>${new Date(item.created_at).toLocaleString()}</small></div>`).join('') : '<p class="empty">No audit activity yet.</p>'; }
}

async function submitPackage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const data = Object.fromEntries(new FormData(form));
  delete data.id;
  try { await adminApi(id ? `/admin/plans/${id}` : '/admin/plans', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); form.reset(); form.elements.currency.value = 'USD'; document.getElementById('package-message').textContent = 'Package saved.'; await loadSection('plans'); } catch (error) { document.getElementById('package-message').textContent = error.message; }
}

async function submitCustomer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try { await adminApi('/admin/customers', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); document.getElementById('customer-message').textContent = 'Customer created.'; await loadSection('customers'); } catch (error) { document.getElementById('customer-message').textContent = error.message; }
}

async function handleManagementClick(event) {
  const selectAdmin = event.target.closest('[data-select-admin]');
  const edit = event.target.closest('[data-edit-plan]');
  const togglePlan = event.target.closest('[data-toggle-plan]');
  const toggleCustomer = event.target.closest('[data-toggle-customer]');
  if (selectAdmin) { document.getElementById('remove-admin-form').dataset.adminId = selectAdmin.dataset.selectAdmin; document.getElementById('remove-admin-message').textContent = 'Administrator selected.'; }
  if (edit) { const data = await adminApi('/admin/plans'); const plan = data.plans.find((item) => String(item.id) === edit.dataset.editPlan); if (plan) { const form = document.getElementById('package-form'); Object.entries({ id: plan.id, name: plan.name, description: plan.description, price: plan.price_usd, currency: plan.currency, duration_h: plan.duration_h, mikrotik_profile: plan.mikrotik_profile }).forEach(([key, value]) => { form.elements[key].value = value; }); } }
  if (togglePlan) { await adminApi(`/admin/plans/${togglePlan.dataset.togglePlan}/status`, { method: 'PATCH', body: JSON.stringify({ active: togglePlan.dataset.active !== 'true' }) }); await loadSection('plans'); }
  if (toggleCustomer) { await adminApi(`/admin/customers/${toggleCustomer.dataset.toggleCustomer}/status`, { method: 'PATCH', body: JSON.stringify({ suspended: toggleCustomer.dataset.suspended !== 'true' }) }); await loadSection('customers'); }
}

async function assignPackage(event) { const select = event.target.closest('[data-assign-customer]'); if (!select || !select.value) return; try { await adminApi(`/admin/customers/${select.dataset.assignCustomer}/assignments`, { method: 'POST', body: JSON.stringify({ planId: Number(select.value) }) }); select.value = ''; } catch (error) { document.getElementById('dashboard-error').textContent = error.message; } }

async function removeAdministrator(event) {
  event.preventDefault();
  const adminId = document.getElementById('remove-admin-form').dataset.adminId;
  const message = document.getElementById('remove-admin-message');
  if (!adminId) { message.textContent = 'Select a non-original administrator first.'; return; }
  try { await adminApi(`/admin/administrators/${adminId}`, { method: 'DELETE', body: JSON.stringify({ otp: event.currentTarget.otp.value }) }); event.currentTarget.reset(); event.currentTarget.dataset.adminId = ''; message.textContent = 'Administrator removed.'; await loadSection('reports'); } catch (error) { message.textContent = error.message; }
}

async function addAdministrator(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById('add-admin-message');
  const button = form.querySelector('button[type="submit"]');
  message.textContent = '';
  setBusy(button, true, 'Add administrator');
  try {
    await adminApi('/admin/administrators', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    form.reset();
    message.className = 'notice success-message';
    message.textContent = 'Administrator added.';
    await loadSection('reports');
  } catch (error) {
    message.className = 'notice error-message';
    message.textContent = error.message;
  } finally {
    setBusy(button, false, 'Add administrator');
  }
}

async function startDashboard() {
  try {
    const data = await adminApi('/auth/me');
    if (String(data.user.role || '').toUpperCase() !== 'ADMIN') throw new Error('Administrator access is required.');
    document.getElementById('admin-name').textContent = data.user.name;
    await loadOverview();
    await adminApi('/admin/audit/login', { method: 'POST', headers: { 'X-CSRF-Token': document.cookie.match(/(?:^|; )somalinet_csrf=([^;]+)/)?.[1] || '' } });
  } catch (error) { document.getElementById('dashboard-error').textContent = error.message; }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admin-login-form')?.addEventListener('submit', login);
  document.getElementById('add-admin-form')?.addEventListener('submit', addAdministrator);
  document.getElementById('package-form')?.addEventListener('submit', submitPackage);
  document.getElementById('customer-create-form')?.addEventListener('submit', submitCustomer);
  document.getElementById('customer-search-form')?.addEventListener('submit', (event) => { event.preventDefault(); loadSection('customers').catch((error) => { document.getElementById('dashboard-error').textContent = error.message; }); });
  document.getElementById('remove-admin-form')?.addEventListener('submit', removeAdministrator);
  document.addEventListener('click', (event) => { handleManagementClick(event).catch((error) => { document.getElementById('dashboard-error').textContent = error.message; }); });
  document.addEventListener('change', (event) => { assignPackage(event); });
  document.getElementById('toggle-password')?.addEventListener('click', (event) => { const input = document.getElementById('admin-password'); input.type = input.type === 'password' ? 'text' : 'password'; event.currentTarget.textContent = input.type === 'password' ? 'Show' : 'Hide'; event.currentTarget.setAttribute('aria-label', `${input.type === 'password' ? 'Show' : 'Hide'} password`); });
  document.querySelectorAll('.nav-item,[data-section-link]').forEach((item) => item.addEventListener('click', () => showSection(item.dataset.section || item.dataset.sectionLink)));
  document.getElementById('logout-button')?.addEventListener('click', async () => {
    const csrfToken = document.cookie.match(/(?:^|; )somalinet_csrf=([^;]+)/)?.[1] || '';
    await fetch('/api/auth/admin-logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken } });
    window.location.href = '/admin/login';
  });
  if (document.body.classList.contains('dashboard-page')) startDashboard();
});
