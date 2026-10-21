const translations = {
  // Somali strings: review by a native speaker before launch
  so: {
    pageTitle: 'SomaliNet | Ku xidhnow', brand: 'SOMALINET', packagesTitle: 'Xirmooyin aan xad lahayn',
    signOut: 'Ka bax', close: 'Xir', account: 'Akoonka SomaliNet', welcomeBack: 'Soo dhawoow', createAccount: 'Samee akoon',
    yourName: 'Magacaaga', fullNamePlaceholder: 'Geli magaca oo dhan', phoneNumber: 'Lambarka telefoonka', phonePlaceholder: 'tusaale 0612345678',
    password: 'Furaha sirta', passwordPlaceholder: '••••••••', signIn: 'Gal', needAccount: 'Akoon ma lihid?', createOne: 'Samee mid',
    alreadyAccount: 'Akoon ma leedahay?', secureCheckout: 'Lacag-bixin ammaan ah', buyInternet: 'Iibso internet', package: 'Xirmo',
    mobileMoneyNumber: 'Lambarka lacagta moobilka', paymentNumberPlaceholder: 'Geli lambarka aad ka bixinayso', deviceMac: 'MAC-ka qalabka', optional: '(ikhtiyaari)',
    macPlaceholder: 'Gelitaanka hotspot-ka tooska ah', confirmPayment: 'Xaqiiji lacag-bixinta', paymentSuccess: 'Lacag-bixinta waa la diray',
    sessionActivating: 'Fadhiga internet-kaaga dhawaan ayaa la hawlgelinayaa.', done: 'Dhammay', restrictedArea: 'Aag xaddidan', adminAccess: 'Gelitaanka maamulka',
    adminPhone: 'Telefoonka maamulka', adminPhonePlaceholder: 'Lambarka telefoonka maamulka', adminPassword: 'Furaha maamulka', adminPasswordPlaceholder: 'Furaha maamulka',
    openDashboard: 'Fur dashboard-ka', dashboard: 'Dashboard', revenue: 'Dakhliga', transactions: 'Macaamilada', activeSessions: 'Fadhiyada firfircoon', recentUsers: 'Isticmaalayaashii u dambeeyay',
    buy: 'Iibso', hour: '1 saac', hours: 'saacadood', day: '1 maalin', days: 'maalmood', noPlans: 'Xirmooyin lama hayo', loadPlansError: 'Xirmooyinka lama soo dejin karin',
    noUsers: 'Isticmaalayaal diiwaangashan ma jiraan.', phonePasswordRequired: 'Telefoon iyo furaha sirta waa loo baahan yahay.', fullNameRequired: 'Magaca oo dhan ayaa loo baahan yahay si akoon loo sameeyo.',
    chooseProvider: 'Marka hore dooro adeeg bixiye.', enterPaymentNumber: 'Geli lambarka lacag-bixinta.', welcome: 'Soo dhawoow', accountCreated: 'Akoonka waa la sameeyay', signedOut: 'Waad ka baxday', adminSignedOut: 'Maamulka waa ka baxay',
    planPrice: 'SOS {price} · {duration}', evcPlus: 'EVC Plus', hormuud: 'Hormuud', zaad: 'Zaad', telesom: 'Telesom', sahal: 'Sahal', golis: 'Golis'
  },
  en: {
    pageTitle: 'SomaliNet | Connect', brand: 'SOMALINET', packagesTitle: 'Unlimited packages', signOut: 'Sign out', close: 'Close', account: 'SomaliNet account', welcomeBack: 'Welcome back', createAccount: 'Create account',
    yourName: 'Your name', fullNamePlaceholder: 'Enter full name', phoneNumber: 'Phone number', phonePlaceholder: 'e.g. 0612345678', password: 'Password', passwordPlaceholder: '••••••••', signIn: 'Sign in', needAccount: 'Need an account?', createOne: 'Create one', alreadyAccount: 'Already have an account?',
    secureCheckout: 'Secure checkout', buyInternet: 'Buy internet', package: 'Package', mobileMoneyNumber: 'Mobile money number', paymentNumberPlaceholder: 'Enter number to pay from', deviceMac: 'Device MAC', optional: '(optional)', macPlaceholder: 'For automatic hotspot login', confirmPayment: 'Confirm payment', paymentSuccess: 'Payment sent successfully', sessionActivating: 'Your internet session will be activated shortly.', done: 'Done',
    restrictedArea: 'Restricted area', adminAccess: 'Admin access', adminPhone: 'Admin phone', adminPhonePlaceholder: 'Admin phone number', adminPassword: 'Admin password', adminPasswordPlaceholder: 'Admin password', openDashboard: 'Open dashboard', dashboard: 'Dashboard', revenue: 'Revenue', transactions: 'Transactions', activeSessions: 'Active sessions', recentUsers: 'Recent users', buy: 'Buy', hour: '1 hour', hours: 'hours', day: '1 day', days: 'days', noPlans: 'No plans available', loadPlansError: 'Could not load plans', noUsers: 'No registered users yet.',
    phonePasswordRequired: 'Phone and password are required.', fullNameRequired: 'Full name is required to create an account.', chooseProvider: 'Choose a provider first.', enterPaymentNumber: 'Enter the payment number.', welcome: 'Welcome back', accountCreated: 'Account created', signedOut: 'You have been signed out', adminSignedOut: 'Admin signed out', planPrice: 'SOS {price} · {duration}', evcPlus: 'EVC Plus', hormuud: 'Hormuud', zaad: 'Zaad', telesom: 'Telesom', sahal: 'Sahal', golis: 'Golis'
  }
};

const SOS_PRICES_BY_USD = { '0.50': 290, '1.00': 570, '2.00': 1140, '10.00': 5720 };
const state = { plans: [], selectedPlan: null, selectedProvider: null, authMode: 'login', language: 'so', token: '', user: null, admin: null, planError: false };

function readStorage(key, fallback = '') { try { return localStorage.getItem(key) || fallback; } catch (error) { return fallback; } }
function writeStorage(key, value) { try { localStorage.setItem(key, value); } catch (error) {} }
function removeStorage(key) { try { localStorage.removeItem(key); } catch (error) {} }
function t(key) { return translations[state.language]?.[key] ?? translations.so[key] ?? key; }
function interpolate(key, values) { return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key)); }
function formatNumber(value) { return Number(value || 0).toLocaleString('en-US'); }
function formatCurrencyFromUsd(value) { const price = SOS_PRICES_BY_USD[Number(value || 0).toFixed(2)]; return `SOS ${formatNumber(price === undefined ? Number(value || 0) : price)}`; }
function formatDurationLabel(hours) { const value = Number(hours); if (value === 1) return t('hour'); if (value < 24) return `${formatNumber(value)} ${t('hours')}`; if (value === 24) return t('day'); return `${formatNumber(value / 24)} ${t('days')}`; }
function formatPlanName(plan) { const name = String(plan.name || '').trim(); return name ? name.toUpperCase() : `${Number(plan.duration_h || 0)} ${t('hours').toUpperCase()}`; }
function getDisplayPrice(plan) { const value = Number(plan.price_usd || 0); const sos = SOS_PRICES_BY_USD[value.toFixed(2)]; return sos === undefined ? `SOS ${formatNumber(value)}` : `SOS ${formatNumber(sos)}`; }

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll('[data-i]').forEach((element) => { element.textContent = t(element.dataset.i); });
  document.querySelectorAll('[data-ph]').forEach((element) => { element.placeholder = t(element.dataset.ph); });
  document.querySelectorAll('[data-aria-i]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.ariaI)); });
  document.title = t('pageTitle');
  document.querySelectorAll('[data-lang]').forEach((button) => { button.setAttribute('aria-pressed', String(button.dataset.lang === state.language)); });
}

function renderPlans() {
  const grid = document.getElementById('plans-grid'); if (!grid) return; grid.replaceChildren();
  if (state.planError || !state.plans.length) { const item = document.createElement('div'); item.className = 'package-item'; item.textContent = state.planError ? t('loadPlansError') : t('noPlans'); grid.appendChild(item); return; }
  state.plans.forEach((plan, index) => {
    const item = document.createElement('div'); item.className = `package-item${index === 2 ? ' featured' : ''}`;
    const copy = document.createElement('div'); copy.className = 'package-copy'; const name = document.createElement('div'); name.className = 'package-name'; name.textContent = formatPlanName(plan); const price = document.createElement('div'); price.className = 'package-price'; price.textContent = interpolate('planPrice', { price: getDisplayPrice(plan).replace('SOS ', ''), duration: formatDurationLabel(plan.duration_h) });
    const button = document.createElement('button'); button.type = 'button'; button.textContent = t('buy'); button.dataset.planId = plan.id; copy.append(name, price); item.append(copy, button); grid.appendChild(item);
    button.addEventListener('click', () => { state.selectedPlan = plan; state.token ? openPaymentModal() : openAuthModal(); });
  });
}
function renderAdmin() { if (!state.admin) return; document.getElementById('admin-revenue').textContent = formatCurrencyFromUsd(state.admin.revenue); document.getElementById('admin-transactions').textContent = formatNumber(state.admin.transactions); document.getElementById('admin-sessions').textContent = formatNumber(state.admin.sessions); const users = document.getElementById('admin-users'); users.replaceChildren(); if (!state.admin.users.length) { const empty = document.createElement('p'); empty.textContent = t('noUsers'); users.appendChild(empty); return; } state.admin.users.forEach((user) => { const row = document.createElement('div'); row.className = 'admin-user'; const name = document.createElement('span'); name.textContent = user.name; const phone = document.createElement('small'); phone.textContent = user.phone; row.append(name, phone); users.appendChild(row); }); }
function render() { applyTranslations(); setAuthMode(state.authMode); renderPlans(); renderAdmin(); if (state.selectedPlan && !document.getElementById('payment-modal').classList.contains('hidden')) updatePaymentSummary(); }
function showToast(message) { const toast = document.getElementById('toast'); if (!toast) return; toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800); }
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); document.body.classList.add('modal-open'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); const open = [...document.querySelectorAll('.modal-backdrop')].some((item) => !item.classList.contains('hidden')); document.body.classList.toggle('modal-open', open); }
function closeAllModals() { document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.classList.add('hidden')); document.body.classList.remove('modal-open'); }
function updateAccountTools() { document.getElementById('logout-button')?.classList.toggle('hidden', !state.token || state.user?.role === 'admin'); }
function setAuthData(token, user) { state.token = token; state.user = user; writeStorage('somalinet_token', token); writeStorage('somalinet_user', JSON.stringify(user)); updateAccountTools(); }
async function api(path, options = {}) { const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || data.message || 'Request failed'); return data; }
async function restoreCustomerSession() {
  if (!state.token) return;
  try {
    const data = await api('/auth/me');
    if (String(data.user?.role || '').toUpperCase() !== 'USER') throw new Error('Not a customer session');
    state.user = data.user;
    writeStorage('somalinet_user', JSON.stringify(data.user));
    updateAccountTools();
  } catch (error) {
    clearSession();
  }
}
async function loadPlans() { try { const response = await fetch('/api/pay/plans'); if (!response.ok) throw new Error(); state.plans = await response.json(); } catch (error) { state.planError = true; } renderPlans(); }
function updatePaymentSummary() { document.getElementById('payment-plan-name').textContent = formatPlanName(state.selectedPlan); document.getElementById('payment-plan-price').textContent = getDisplayPrice(state.selectedPlan); }
function openPaymentModal() { if (!state.selectedPlan) return; updatePaymentSummary(); document.getElementById('provider-options').classList.remove('hidden'); document.getElementById('payment-form').classList.add('hidden'); document.getElementById('payment-phone').value = state.user?.phone || ''; openModal('payment-modal'); }
function setAuthMode(mode) { state.authMode = mode; const register = mode === 'register'; document.getElementById('auth-title').textContent = t(register ? 'createAccount' : 'welcomeBack'); document.getElementById('auth-name-wrap').classList.toggle('hidden', !register); document.getElementById('auth-submit').textContent = t(register ? 'createAccount' : 'signIn'); document.getElementById('auth-toggle-copy').textContent = t(register ? 'alreadyAccount' : 'needAccount'); document.getElementById('auth-toggle').textContent = t(register ? 'signIn' : 'createOne'); }
function openAuthModal() { setAuthMode(state.authMode); openModal('auth-modal'); }
async function handleAuthSubmit(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const phone = String(form.get('phone') || '').trim(); const password = String(form.get('password') || '').trim(); const name = String(form.get('name') || '').trim(); const errorEl = document.getElementById('auth-error'); if (!phone || !password) { errorEl.textContent = t('phonePasswordRequired'); return; } try { const register = state.authMode === 'register'; if (register && !name) throw new Error(t('fullNameRequired')); const data = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(register ? { name, phone, password } : { phone, password }) }); setAuthData(data.token, data.user); errorEl.textContent = ''; closeAllModals(); showToast(t(register ? 'accountCreated' : 'welcome')); if (state.selectedPlan) openPaymentModal(); } catch (error) { errorEl.textContent = error.message; } }
async function handlePaymentSubmit(event) { event.preventDefault(); const errorEl = document.getElementById('payment-error'); if (!state.selectedProvider) { errorEl.textContent = t('chooseProvider'); return; } const phone = document.getElementById('payment-phone').value.trim(); if (!phone) { errorEl.textContent = t('enterPaymentNumber'); return; } try { const result = await api(`/pay/${state.selectedProvider}`, { method: 'POST', body: JSON.stringify({ planId: state.selectedPlan.id, phone, macAddress: document.getElementById('payment-mac').value.trim() || undefined }) }); errorEl.textContent = ''; document.getElementById('payment-form').classList.add('hidden'); document.getElementById('provider-options').classList.add('hidden'); document.getElementById('payment-success').classList.remove('hidden'); showToast(result.message || t('paymentSuccess')); } catch (error) { errorEl.textContent = error.message; } }
async function loadAdminDashboard() { const [revenue, sessions, users] = await Promise.all([api('/admin/revenue?period=today'), api('/admin/sessions'), api('/admin/users?page=1')]); state.admin = { revenue: revenue.totalUSD, transactions: revenue.transactions, sessions: sessions.count, users: users.users }; renderAdmin(); }
function openAdminModal() { const admin = state.user?.role === 'admin'; document.getElementById('admin-login-form').classList.toggle('hidden', admin); document.getElementById('admin-dashboard').classList.toggle('hidden', !admin); openModal('admin-modal'); if (admin) loadAdminDashboard().catch((error) => showToast(error.message)); }
function clearSession() { state.token = ''; state.user = null; removeStorage('somalinet_token'); removeStorage('somalinet_user'); updateAccountTools(); }
function logoutUser() { clearSession(); showToast(t('signedOut')); }
function adminLogout() { clearSession(); state.admin = null; document.getElementById('admin-login-form').classList.remove('hidden'); document.getElementById('admin-dashboard').classList.add('hidden'); showToast(t('adminSignedOut')); }
async function handleAdminLogin(event) { event.preventDefault(); try { const data = await api('/auth/admin-login', { method: 'POST', body: JSON.stringify({ phone: document.getElementById('admin-phone').value.trim(), password: document.getElementById('admin-password').value }) }); setAuthData(data.token, data.user); document.getElementById('admin-login-form').classList.add('hidden'); document.getElementById('admin-dashboard').classList.remove('hidden'); await loadAdminDashboard(); } catch (error) { document.getElementById('admin-error').textContent = error.message; } }

document.addEventListener('DOMContentLoaded', () => {
  state.language = readStorage('sn_lang', 'so') === 'en' ? 'en' : 'so'; state.token = readStorage('somalinet_token'); try { state.user = JSON.parse(readStorage('somalinet_user', 'null')); } catch (error) { state.user = null; }
  document.querySelectorAll('[data-lang]').forEach((button) => button.addEventListener('click', () => { state.language = button.dataset.lang; writeStorage('sn_lang', state.language); render(); button.focus(); }));
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit); document.getElementById('auth-toggle').addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login')); document.getElementById('payment-form').addEventListener('submit', handlePaymentSubmit);
  document.querySelectorAll('.provider-option').forEach((button) => button.addEventListener('click', () => { state.selectedProvider = button.dataset.provider; document.getElementById('provider-options').classList.add('hidden'); document.getElementById('payment-form').classList.remove('hidden'); document.getElementById('payment-phone').focus(); }));
  document.getElementById('logout-button').addEventListener('click', logoutUser); document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin); document.getElementById('admin-logout-button').addEventListener('click', adminLogout); document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  render(); updateAccountTools(); restoreCustomerSession().finally(loadPlans);
});
