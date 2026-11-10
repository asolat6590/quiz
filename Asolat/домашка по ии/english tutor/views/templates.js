const fs = require('node:fs');
const path = require('node:path');

const FALLBACK_LOGIN_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Вход для администратора | Elena Vance English Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="navbar">
    <div class="container nav-inner">
      <a href="/" class="logo">
        <span class="logo-badge">🎓</span>
        <span>Elena Vance</span>
      </a>
      <div class="nav-actions">
        <a href="/" class="btn btn-secondary">← Вернуться на главную</a>
      </div>
    </div>
  </header>

  <main class="container" style="min-height: calc(100vh - 180px); display: flex; align-items: center; justify-content: center; padding-top: 48px; padding-bottom: 64px;">
    <div style="width: 100%; max-width: 480px;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div class="eyebrow">
          <span class="eyebrow-dot"></span>
          Защищённая зона преподавателя
        </div>
        <h1 style="font-size: clamp(2rem, 3.5vw, 2.65rem);">
          Вход в <span class="accent-word">панель</span>
        </h1>
        <p style="color: var(--text-olive); margin-top: 10px; font-size: 0.96rem;">
          Авторизуйтесь для управления расписанием и записями учеников
        </p>
      </div>

      <form id="loginForm" class="booking-card" style="background: var(--bg-white); padding: 36px;" novalidate>
        <div id="loginAlert" class="alert-box" role="alert"></div>

        <div class="form-group" style="margin-bottom: 18px;">
          <label for="adminEmail">Email администратора *</label>
          <input
            type="email"
            id="adminEmail"
            class="input-field"
            placeholder="Введите ваш email"
            autocomplete="username"
            required
          />
        </div>

        <div class="form-group" style="margin-bottom: 24px;">
          <label for="adminPassword">Пароль *</label>
          <div style="position: relative;">
            <input
              type="password"
              id="adminPassword"
              class="input-field"
              placeholder="Введите пароль"
              autocomplete="current-password"
              style="padding-right: 48px;"
              required
            />
            <button
              type="button"
              id="togglePasswordBtn"
              aria-label="Показать или скрыть пароль"
              style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-olive);"
            >
              👁
            </button>
          </div>
        </div>

        <button type="submit" class="btn btn-forest btn-full" id="loginSubmitBtn" style="padding: 14px 24px; font-size: 1rem;">
          Войти в админ-панель
        </button>

        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(20,38,29,0.08); display: flex; align-items: center; gap: 10px; font-size: 0.84rem; color: var(--text-olive);">
          <span class="squircle-badge squircle-lime" style="width: 30px; height: 30px; font-size: 0.78rem; border-radius: 8px;">🔒</span>
          <span>Серверная сессия (HttpOnly cookie) и криптографическое хэширование паролей (scrypt).</span>
        </div>
      </form>
    </div>
  </main>

  <script src="/login.js"></script>
</body>
</html>`;

const FALLBACK_ADMIN_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Админ-панель | Управление записями учеников</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="navbar">
    <div class="container nav-inner">
      <a href="/" class="logo">
        <span class="logo-badge">🎓</span>
        <span>Elena Vance <small style="display:block;font-family:var(--font-sans);font-size:0.75rem;font-weight:600;color:var(--text-olive);">Админ-панель</small></span>
      </a>
      <div class="nav-actions">
        <span id="adminEmailBadge" class="badge badge-completed" style="padding: 8px 14px; font-size: 0.84rem;">🔒 Администратор</span>
        <a href="/" class="btn btn-secondary">← На сайт</a>
        <button type="button" class="btn btn-orange" id="logoutBtn">Выйти</button>
      </div>
    </div>
  </header>

  <main class="container" style="padding-bottom: 72px;">
    <div class="admin-header">
      <div>
        <div class="eyebrow" style="margin-bottom: 12px;">
          <span class="eyebrow-dot"></span>
          База данных • Время по Ташкенту (UTC+5)
        </div>
        <h1 style="font-size: clamp(1.85rem, 3vw, 2.5rem);">
          Записи <span class="accent-word">учеников</span>
        </h1>
      </div>
      <button class="btn btn-forest" id="refreshBtn">↻ Обновить список</button>
    </div>

    <div id="adminAlert" class="alert-box" role="alert"></div>

    <div class="stats-cards">
      <div class="stat-card">
        <span>Всего записей</span>
        <strong id="statTotal">0</strong>
      </div>
      <div class="stat-card">
        <span>Ожидают подтверждения</span>
        <strong id="statPending">0</strong>
      </div>
      <div class="stat-card">
        <span>Подтверждены</span>
        <strong id="statConfirmed">0</strong>
      </div>
      <div class="stat-card">
        <span>Проведены / Завершены</span>
        <strong id="statCompleted">0</strong>
      </div>
    </div>

    <div class="admin-toolbar">
      <div class="filter-group">
        <input
          type="text"
          id="searchInput"
          class="input-field"
          placeholder="Поиск по имени или телефону (+998)..."
        />
        <select id="serviceFilter" class="input-field">
          <option value="all">Все услуги</option>
          <option value="General English">General English</option>
          <option value="IELTS Preparation">IELTS Preparation</option>
          <option value="Speaking Practice">Speaking Practice</option>
          <option value="Trial Lesson">Trial Lesson</option>
        </select>
        <select id="statusFilter" class="input-field">
          <option value="all">Все статусы</option>
          <option value="pending">Ожидает</option>
          <option value="confirmed">Подтверждена</option>
          <option value="completed">Завершена</option>
          <option value="cancelled">Отменена</option>
        </select>
      </div>
    </div>

    <div class="table-card">
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Ученик</th>
              <th>Контактные данные</th>
              <th>Услуга</th>
              <th>Дата и время (UZT)</th>
              <th>Текущий статус</th>
              <th>Изменить статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody id="bookingsTableBody">
            <tr>
              <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-olive);">
                Загрузка записей...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <script src="/admin.js"></script>
</body>
</html>`;

module.exports = {
  getLoginHtml() {
    try {
      return fs.readFileSync(path.join(__dirname, 'login.html'), 'utf8');
    } catch {
      return FALLBACK_LOGIN_HTML;
    }
  },
  getAdminHtml() {
    try {
      return fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    } catch {
      return FALLBACK_ADMIN_HTML;
    }
  }
};
