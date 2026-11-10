document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');

  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  const state = {
    service: 'General English',
    priceLabel: '150 000 сум • 60 мин',
    date: '',
    time: ''
  };

  const serviceOptions = document.querySelectorAll('.service-option-btn');
  const serviceTriggers = document.querySelectorAll('.select-service-trigger');
  const quickDaysContainer = document.getElementById('quickDays');
  const bookingDateInput = document.getElementById('bookingDate');
  const slotsContainer = document.getElementById('slotsContainer');
  const bookingForm = document.getElementById('bookingForm');
  const formAlert = document.getElementById('formAlert');
  const submitBookingBtn = document.getElementById('submitBookingBtn');

  const summaryService = document.getElementById('summaryService');
  const summaryPrice = document.getElementById('summaryPrice');
  const summaryDate = document.getElementById('summaryDate');
  const summaryTime = document.getElementById('summaryTime');

  const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MONTH_NAMES = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  function toYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatHumanDate(ymd) {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${d} ${MONTH_NAMES[m - 1]} ${y} (${DAY_NAMES[dt.getDay()]})`;
  }

  function showAlert(type, message) {
    formAlert.className = `alert-box ${type}`;
    formAlert.textContent = message;
    formAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearAlert() {
    formAlert.className = 'alert-box';
    formAlert.textContent = '';
  }

  function updateSummary() {
    summaryService.textContent = state.service;
    summaryPrice.textContent = state.priceLabel;
    summaryDate.textContent = formatHumanDate(state.date);
    summaryTime.textContent = state.time ? `${state.time} (Ташкент, UTC+5)` : 'Не выбрано';
  }

  function selectService(serviceName) {
    serviceOptions.forEach(btn => {
      if (btn.dataset.service === serviceName) {
        btn.classList.add('active');
        state.service = serviceName;
        state.priceLabel = btn.dataset.price || '';
      } else {
        btn.classList.remove('active');
      }
    });
    updateSummary();
  }

  serviceOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      clearAlert();
      selectService(btn.dataset.service);
    });
  });

  serviceTriggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const targetService = trigger.dataset.service;
      selectService(targetService);
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
    });
  });

  function renderQuickDays() {
    quickDaysContainer.innerHTML = '';
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const ymd = toYMD(d);

      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `day-pill ${state.date === ymd ? 'active' : ''}`;
      pill.dataset.date = ymd;
      pill.innerHTML = `
        <span class="day-name">${i === 0 ? 'Сег' : DAY_NAMES[d.getDay()]}</span>
        <span class="day-num">${d.getDate()}</span>
      `;

      pill.addEventListener('click', () => {
        clearAlert();
        setDate(ymd);
      });

      quickDaysContainer.appendChild(pill);
    }
  }

  async function loadSlotsForDate(ymd) {
    slotsContainer.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-olive); font-size: 0.9rem;">Загрузка расписания...</div>';
    try {
      const res = await fetch(`/api/slots?date=${encodeURIComponent(ymd)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось загрузить слоты');
      }

      slotsContainer.innerHTML = '';
      let currentStillAvailable = false;

      data.slots.forEach(slot => {
        if (slot.time === state.time && slot.available) {
          currentStillAvailable = true;
        }
      });

      if (!currentStillAvailable) {
        const firstFree = data.slots.find(s => s.available);
        state.time = firstFree ? firstFree.time : '';
      }

      data.slots.forEach(slot => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isSelected = slot.available && state.time === slot.time;
        btn.className = `slot-btn ${isSelected ? 'active' : ''}`;
        btn.disabled = !slot.available;

        btn.innerHTML = `
          <span>${slot.time}</span>
          <span class="slot-status">${slot.available ? 'Свободно' : 'Занято'}</span>
        `;

        if (slot.available) {
          btn.addEventListener('click', () => {
            clearAlert();
            state.time = slot.time;
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSummary();
          });
        }

        slotsContainer.appendChild(btn);
      });

      updateSummary();
    } catch (err) {
      slotsContainer.innerHTML = `<div style="grid-column: 1 / -1; color: #7c2d12;">${err.message}</div>`;
    }
  }

  function setDate(ymd) {
    state.date = ymd;
    bookingDateInput.value = ymd;
    renderQuickDays();
    updateSummary();
    loadSlotsForDate(ymd);
  }

  const todayYMD = toYMD(new Date());
  bookingDateInput.min = todayYMD;
  setDate(todayYMD);

  bookingDateInput.addEventListener('change', e => {
    if (e.target.value) {
      clearAlert();
      setDate(e.target.value);
    }
  });

  bookingForm.addEventListener('submit', async e => {
    e.preventDefault();
    clearAlert();

    const student_name = document.getElementById('studentName').value.trim();
    const contact = document.getElementById('studentContact').value.trim();
    const notes = document.getElementById('studentNotes').value.trim();

    if (!state.date) {
      return showAlert('error', 'Пожалуйста, выберите дату урока.');
    }
    if (!state.time) {
      return showAlert('error', 'Пожалуйста, выберите свободное время урока.');
    }
    if (student_name.length < 2) {
      return showAlert('error', 'Пожалуйста, введите ваше имя.');
    }
    if (contact.length < 4) {
      return showAlert('error', 'Пожалуйста, укажите ваш телефон или email.');
    }

    submitBookingBtn.disabled = true;
    submitBookingBtn.textContent = 'Сохранение записи...';

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name,
          contact,
          service: state.service,
          date: state.date,
          time: state.time,
          notes
        })
      });

      const result = await response.json();

      if (!response.ok) {
        showAlert('error', result.error || 'Ошибка при создании записи.');
        await loadSlotsForDate(state.date);
        return;
      }

      const bookedTime = state.time;
      document.getElementById('studentName').value = '';
      document.getElementById('studentContact').value = '';
      document.getElementById('studentNotes').value = '';

      showAlert(
        'success',
        `Отлично, ${result.booking.student_name}! Вы записаны на «${result.booking.service}» — ${formatHumanDate(result.booking.date)} в ${bookedTime}. Запись сохранена в базе данных.`
      );

      await loadSlotsForDate(state.date);
    } catch (error) {
      showAlert('error', 'Не удалось отправить форму. Проверьте соединение с сервером.');
    } finally {
      submitBookingBtn.disabled = false;
      submitBookingBtn.textContent = 'Подтвердить запись на урок';
    }
  });
});
