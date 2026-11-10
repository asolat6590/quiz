document.addEventListener('DOMContentLoaded', () => {
  const adminMain = document.getElementById('adminMain');
  const tableBody = document.getElementById('bookingsTableBody');
  const searchInput = document.getElementById('searchInput');
  const serviceFilter = document.getElementById('serviceFilter');
  const statusFilter = document.getElementById('statusFilter');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminEmailBadge = document.getElementById('adminEmailBadge');
  const adminAlert = document.getElementById('adminAlert');

  const statTotal = document.getElementById('statTotal');
  const statPending = document.getElementById('statPending');
  const statConfirmed = document.getElementById('statConfirmed');
  const statCompleted = document.getElementById('statCompleted');

  let allBookings = [];

  const STATUS_META = {
    pending: { label: 'Ожидает', badgeClass: 'badge-pending' },
    confirmed: { label: 'Подтверждена', badgeClass: 'badge-confirmed' },
    completed: { label: 'Завершена', badgeClass: 'badge-completed' },
    cancelled: { label: 'Отменена', badgeClass: 'badge-cancelled' }
  };

  function showAlert(type, text) {
    adminAlert.className = `alert-box ${type}`;
    adminAlert.textContent = text;
    setTimeout(() => {
      adminAlert.className = 'alert-box';
      adminAlert.textContent = '';
    }, 4500);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function verifySession() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        window.location.replace('/login');
        return false;
      }
      const data = await res.json();
      if (data.authenticated && data.admin) {
        if (adminEmailBadge) {
          adminEmailBadge.textContent = `🔒 ${data.admin.email}`;
        }
        if (adminMain) {
          adminMain.style.display = 'block';
        }
        return true;
      }
      window.location.replace('/login');
      return false;
    } catch {
      window.location.replace('/login');
      return false;
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.replace('/login');
      }
    });
  }

  function updateStats(bookings) {
    statTotal.textContent = bookings.length;
    statPending.textContent = bookings.filter(b => b.status === 'pending').length;
    statConfirmed.textContent = bookings.filter(b => b.status === 'confirmed').length;
    statCompleted.textContent = bookings.filter(b => b.status === 'completed').length;
  }

  function renderTable() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedService = serviceFilter.value;
    const selectedStatus = statusFilter.value;

    const filtered = allBookings.filter(item => {
      const matchesSearch =
        !query ||
        item.student_name.toLowerCase().includes(query) ||
        item.contact.toLowerCase().includes(query) ||
        (item.notes && item.notes.toLowerCase().includes(query));

      const matchesService = selectedService === 'all' || item.service === selectedService;
      const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;

      return matchesSearch && matchesService && matchesStatus;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-olive);">
            Записей по выбранным критериям не найдено.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered
      .map(b => {
        const meta = STATUS_META[b.status] || STATUS_META.pending;
        return `
          <tr data-id="${b.id}">
            <td style="color: var(--text-muted); font-weight: 700;">#${b.id}</td>
            <td>
              <strong>${escapeHtml(b.student_name)}</strong>
              ${b.notes ? `<div style="font-size: 0.8rem; color: var(--text-olive); margin-top: 2px;">💬 ${escapeHtml(b.notes)}</div>` : ''}
            </td>
            <td>${escapeHtml(b.contact)}</td>
            <td><strong>${escapeHtml(b.service)}</strong></td>
            <td>
              <div><strong>${escapeHtml(b.date)}</strong></div>
              <div style="font-size: 0.84rem; color: var(--text-olive);">🕒 ${escapeHtml(b.time)} (Ташкент)</div>
            </td>
            <td>
              <span class="badge ${meta.badgeClass}">${meta.label}</span>
            </td>
            <td>
              <select class="status-select" data-id="${b.id}" aria-label="Изменить статус">
                <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Ожидает</option>
                <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Подтверждена</option>
                <option value="completed" ${b.status === 'completed' ? 'selected' : ''}>Завершена</option>
                <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Отменена</option>
              </select>
            </td>
            <td>
              <button type="button" class="btn-danger-sm delete-btn" data-id="${b.id}">
                Удалить
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  async function fetchBookings() {
    try {
      const res = await fetch('/api/bookings');
      if (res.status === 401) {
        window.location.replace('/login');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка загрузки записей');
      }
      allBookings = data.bookings || [];
      updateStats(allBookings);
      renderTable();
    } catch (err) {
      showAlert('error', err.message);
    }
  }

  tableBody.addEventListener('change', async e => {
    if (e.target.classList.contains('status-select')) {
      const id = e.target.dataset.id;
      const newStatus = e.target.value;

      try {
        const res = await fetch(`/api/bookings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.status === 401) {
          window.location.replace('/login');
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          showAlert('error', data.error || 'Не удалось обновить статус');
          await fetchBookings();
          return;
        }
        showAlert('success', `Статус записи #${id} обновлён.`);
        await fetchBookings();
      } catch (err) {
        showAlert('error', 'Ошибка соединения с сервером.');
      }
    }
  });

  tableBody.addEventListener('click', async e => {
    if (e.target.classList.contains('delete-btn')) {
      const id = e.target.dataset.id;
      const confirmed = window.confirm(`Удалить запись #${id} из базы данных?`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/bookings/${id}`, {
          method: 'DELETE'
        });
        if (res.status === 401) {
          window.location.replace('/login');
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          showAlert('error', data.error || 'Не удалось удалить запись');
          return;
        }
        showAlert('success', `Запись #${id} удалена.`);
        await fetchBookings();
      } catch (err) {
        showAlert('error', 'Ошибка соединения с сервером.');
      }
    }
  });

  searchInput.addEventListener('input', renderTable);
  serviceFilter.addEventListener('change', renderTable);
  statusFilter.addEventListener('change', renderTable);
  refreshBtn.addEventListener('click', fetchBookings);

  (async () => {
    const ok = await verifySession();
    if (ok) {
      await fetchBookings();
    }
  })();
});
