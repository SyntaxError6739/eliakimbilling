const state = {
  plans: [],
  selectedPlan: null,
  selectedProvider: null,
  authMode: 'login',
  token: localStorage.getItem('somalinet_token') || '',
  user: (() => {
    try {
      return JSON.parse(localStorage.getItem('somalinet_user') || 'null');
    } catch (error) {
      return null;
    }
  })(),
};

const SOS_PER_USD = 10000;

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');

  const remaining = [...document.querySelectorAll('.modal-backdrop')].filter(
    (item) => !item.classList.contains('hidden')
  ).length;

  document.body.classList.toggle('modal-open', remaining > 0);
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.classList.add('hidden'));
  document.body.classList.remove('modal-open');
}

function formatDurationLabel(hours) {
  const h = Number(hours);
  if (h === 1) return '1 Hour';
  if (h < 24) return `${h} Hours`;
  if (h === 24) return '1 Day';
  return `${h / 24} Days`;
}

function formatPlanName(plan) {
  const name = (plan.name || '').toString().trim();
  if (name) return name.toUpperCase();
  const hours = Number(plan.duration_h || 0);
  return `${hours} HOURS UNLIMITED`;
}

function getDisplayPrice(plan) {
  const usdPrice = Number(plan.price_usd || 0);
  return Math.round(usdPrice * SOS_PER_USD).toLocaleString('en-US');
}

function renderPlans() {
  const grid = document.getElementById('plans-grid');
  if (!grid) return;

  if (!state.plans.length) {
    grid.innerHTML = '<div class="package-item"><div class="package-copy"><div class="package-name">No plans available</div></div></div>';
    return;
  }

  grid.innerHTML = state.plans.map((plan, index) => {
    const label = formatPlanName(plan);
    const priceAmount = getDisplayPrice(plan);
    const durationText = formatDurationLabel(plan.duration_h);
    const featured = index === 2 ? 'featured' : '';

    return `
      <div class="package-item ${featured}">
        <div class="package-copy">
          <div class="package-name">${label}</div>
          <div class="package-price">SOS ${priceAmount} for ${durationText}</div>
        </div>
        <button type="button" data-plan-id="${plan.id}">Buy</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('button[data-plan-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const planId = Number(button.dataset.planId);
      const plan = state.plans.find((item) => Number(item.id) === planId);
      if (!plan) return;

      state.selectedPlan = plan;

      if (!state.token) {
        openAuthModal();
        return;
      }

      openPaymentModal();
    });
  });
}

function setAuthData(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('somalinet_token', token);
  localStorage.setItem('somalinet_user', JSON.stringify(user));
  updateAccountTools();
}

function updateAccountTools() {
  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.classList.toggle('hidden', !state.token || state.user?.role === 'admin');
  }
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }

  return data;
}

async function loadPlans() {
  try {
    const response = await fetch('/api/pay/plans');
    if (!response.ok) throw new Error('Unable to fetch plans');
    state.plans = await response.json();
    renderPlans();
  } catch (error) {
    const grid = document.getElementById('plans-grid');
    if (grid) {
      grid.innerHTML = '<div class="package-item"><div class="package-copy"><div class="package-name">Could not load plans</div></div></div>';
    }
  }
}

async function logoutUser() {
  try {
    const sessionResponse = await api('/session/status');
    if (sessionResponse.active && sessionResponse.session?.id) {
      await api('/session/logout', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sessionResponse.session.id }),
      });
    }
  } catch (error) {
    // The local token is still cleared when the session is already expired.
  }

  state.token = '';
  state.user = null;
  localStorage.removeItem('somalinet_token');
  localStorage.removeItem('somalinet_user');
  updateAccountTools();
  showToast('You have been signed out');
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const errorEl = document.getElementById('admin-error');
  errorEl.textContent = '';

  try {
    const data = await api('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({
        phone: document.getElementById('admin-phone').value.trim(),
        password: document.getElementById('admin-password').value,
      }),
    });

    setAuthData(data.token, data.user);
    document.getElementById('admin-login-form').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    await loadAdminDashboard();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function loadAdminDashboard() {
  const [revenue, sessions, users] = await Promise.all([
    api('/admin/revenue?period=today'),
    api('/admin/sessions'),
    api('/admin/users?page=1'),
  ]);

  document.getElementById('admin-revenue').textContent = `SOS ${(Number(revenue.totalUSD || 0) * SOS_PER_USD).toLocaleString('en-US')}`;
  document.getElementById('admin-transactions').textContent = revenue.transactions;
  document.getElementById('admin-sessions').textContent = sessions.count;
  document.getElementById('admin-users').innerHTML = users.users.length
    ? users.users.map((user) => `<div class="admin-user"><span>${user.name}</span><small>${user.phone}</small></div>`).join('')
    : '<p>No registered users yet.</p>';
}

function openAdminModal() {
  const isAdmin = state.user?.role === 'admin';
  document.getElementById('admin-login-form').classList.toggle('hidden', isAdmin);
  document.getElementById('admin-dashboard').classList.toggle('hidden', !isAdmin);
  openModal('admin-modal');
  if (isAdmin) loadAdminDashboard().catch((error) => showToast(error.message));
}

function adminLogout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('somalinet_token');
  localStorage.removeItem('somalinet_user');
  document.getElementById('admin-login-form').classList.remove('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
  updateAccountTools();
  showToast('Admin signed out');
}

function setAuthMode(mode) {
  state.authMode = mode;

  const title = document.getElementById('auth-title');
  const nameWrap = document.getElementById('auth-name-wrap');
  const submit = document.getElementById('auth-submit');
  const toggleText = document.getElementById('auth-toggle-copy');
  const toggleButton = document.getElementById('auth-toggle');

  if (title) {
    title.textContent = mode === 'login' ? 'Welcome back' : 'Create account';
  }

  if (nameWrap) {
    nameWrap.classList.toggle('hidden', mode !== 'register');
  }

  if (submit) {
    submit.textContent = mode === 'login' ? 'Sign in' : 'Create account';
  }

  if (toggleText && toggleButton) {
    if (mode === 'login') {
      toggleText.textContent = 'Need an account?';
      toggleButton.textContent = 'Create one';
    } else {
      toggleText.textContent = 'Already have an account?';
      toggleButton.textContent = 'Sign in';
    }
  }
}

function openAuthModal() {
  setAuthMode(state.authMode || 'login');
  openModal('auth-modal');
}

function openPaymentModal() {
  if (!state.selectedPlan) return;

  const summary = document.getElementById('payment-plan-name');
  const price = document.getElementById('payment-plan-price');
  const providerOptions = document.getElementById('provider-options');
  const paymentForm = document.getElementById('payment-form');
  const paymentPhone = document.getElementById('payment-phone');

  if (summary) summary.textContent = formatPlanName(state.selectedPlan);
  if (price) price.textContent = `SOS ${getDisplayPrice(state.selectedPlan)}`;
  if (providerOptions) providerOptions.classList.remove('hidden');
  if (paymentForm) paymentForm.classList.add('hidden');
  if (paymentPhone) paymentPhone.value = state.user?.phone || '';

  openModal('payment-modal');
}

function selectProvider(provider) {
  state.selectedProvider = provider;

  const providerOptions = document.getElementById('provider-options');
  const paymentForm = document.getElementById('payment-form');
  const paymentPhone = document.getElementById('payment-phone');
  const paymentError = document.getElementById('payment-error');

  if (providerOptions) providerOptions.classList.add('hidden');
  if (paymentForm) paymentForm.classList.remove('hidden');
  if (paymentPhone) {
    paymentPhone.value = state.user?.phone || '';
    paymentPhone.focus();
  }
  if (paymentError) paymentError.textContent = '';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const phone = String(form.get('phone') || '').trim();
  const password = String(form.get('password') || '').trim();
  const name = String(form.get('name') || '').trim();
  const errorEl = document.getElementById('auth-error');

  if (!phone || !password) {
    errorEl.textContent = 'Phone and password are required.';
    return;
  }

  try {
    const endpoint = state.authMode === 'login' ? '/auth/login' : '/auth/register';
    const payload = state.authMode === 'login'
      ? { phone, password }
      : { name, phone, password };

    if (state.authMode === 'register' && !name) {
      throw new Error('Full name is required to create an account.');
    }

    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setAuthData(data.token, data.user);
    errorEl.textContent = '';
    closeAllModals();
    showToast(state.authMode === 'login' ? 'Welcome back' : 'Account created');

    if (state.selectedPlan) {
      openPaymentModal();
    }
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  if (!state.selectedPlan || !state.selectedProvider) {
    document.getElementById('payment-error').textContent = 'Choose a provider first.';
    return;
  }

  const phone = document.getElementById('payment-phone').value.trim();
  const macAddress = document.getElementById('payment-mac').value.trim();
  const errorEl = document.getElementById('payment-error');

  if (!phone) {
    errorEl.textContent = 'Enter the payment number.';
    return;
  }

  try {
    const result = await api(`/pay/${state.selectedProvider}`, {
      method: 'POST',
      body: JSON.stringify({
        planId: state.selectedPlan.id,
        phone,
        macAddress: macAddress || undefined,
      }),
    });

    errorEl.textContent = '';
    document.getElementById('payment-form').classList.add('hidden');
    document.getElementById('provider-options').classList.add('hidden');
    document.getElementById('payment-success').classList.remove('hidden');
    showToast(result.message || 'Payment requested successfully');
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('auth-form');
  const authToggle = document.getElementById('auth-toggle');
  const providerButtons = document.querySelectorAll('.provider-option');
  const paymentForm = document.getElementById('payment-form');
  const closeButtons = document.querySelectorAll('[data-close-modal]');

  if (authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }

  if (authToggle) {
    authToggle.addEventListener('click', () => {
      setAuthMode(state.authMode === 'login' ? 'register' : 'login');
    });
  }

  providerButtons.forEach((button) => {
    button.addEventListener('click', () => selectProvider(button.dataset.provider));
  });

  if (paymentForm) {
    paymentForm.addEventListener('submit', handlePaymentSubmit);
  }

  document.getElementById('logout-button')?.addEventListener('click', logoutUser);
  document.getElementById('admin-access-button')?.addEventListener('click', openAdminModal);
  document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
  document.getElementById('admin-logout-button')?.addEventListener('click', adminLogout);

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const modalId = button.dataset.closeModal || button.closest('.modal-backdrop')?.id;
      if (modalId) closeModal(modalId);
    });
  });

  setAuthMode('login');
  updateAccountTools();
  loadPlans();
});
