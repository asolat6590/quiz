document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const loginAlert = document.getElementById('loginAlert');
  const submitBtn = document.getElementById('loginSubmitBtn');

  function showAlert(type, message) {
    loginAlert.className = `alert-box ${type}`;
    loginAlert.textContent = message;
  }

  function clearAlert() {
    loginAlert.className = 'alert-box';
    loginAlert.textContent = '';
  }

  // If already logged in, redirect to /admin
  fetch('/api/auth/me')
    .then(res => {
      if (res.ok) window.location.replace('/admin');
    })
    .catch(() => {});

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      togglePasswordBtn.textContent = isHidden ? '🙈' : '👁';
    });
  }

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    clearAlert();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      return showAlert('error', 'Пожалуйста, заполните поля Email и Пароль.');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Проверка данных...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert('error', data.error || 'Неверный Email или пароль.');
        return;
      }

      showAlert('success', 'Вход выполнен! Перенаправление в админ-панель...');
      window.location.href = '/admin';
    } catch (err) {
      showAlert('error', 'Ошибка соединения с сервером.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Войти в админ-панель';
    }
  });
});
