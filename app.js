document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  // Keep date inputs usable instead of leaving the original 2024 demo dates.
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  ["#schedule-date", "#bulk-start-date"].forEach((selector) => {
    const input = document.querySelector(selector);
    if (input && (!input.value || input.value < localDate)) input.value = localDate;
    if (input) input.min = localDate;
  });

  const modal = document.querySelector('#modal-backdrop');
  const openButtons = [document.querySelector('#create-content'), document.querySelector('#calendar-add')];
  const closeButtons = [document.querySelector('#modal-close'), document.querySelector('#modal-cancel')];
  const form = document.querySelector('#schedule-form');
  const toast = document.querySelector('#toast');
  const toastMessage = document.querySelector('#toast-message');
  let toastTimer;

  const showToast = (message) => {
    toastMessage.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3300);
  };

  const setMode = (mode) => {
    form.classList.toggle('bulk-active', mode === 'bulk');
    document.querySelectorAll('.mode-choice').forEach((choice) => choice.classList.toggle('active', choice.dataset.mode === mode));
  };

  const openModal = (mode = 'single') => {
    setMode(mode);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => document.querySelector(mode === 'bulk' ? '#bulk-drop-zone' : '#content-title')?.focus(), 80);
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
  };

  openButtons.forEach((button) => button?.addEventListener('click', openModal));
  document.querySelector('#plan-week')?.addEventListener('click', () => openModal('bulk'));
  document.querySelector('#bulk-schedule')?.addEventListener('click', () => openModal('bulk'));
  closeButtons.forEach((button) => button?.addEventListener('click', closeModal));
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });

  document.querySelectorAll('.type-choice').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.type-choice').forEach((choice) => choice.classList.remove('active'));
      button.classList.add('active');
    });
  });

  document.querySelectorAll('.mode-choice').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.classList.contains('bulk-active')) {
      const batchSize = document.querySelectorAll('.batch-file').length + 5;
      const count = document.querySelector('#scheduled-count');
      count.textContent = String(Number(count.textContent) + batchSize);
      closeModal();
      form.reset();
      setMode('single');
      showToast(`${batchSize} mixed posts, videos, and reels added to your queue`);
      return;
    }
    const title = document.querySelector('#content-title').value.trim() || 'Untitled content';
    const contentType = document.querySelector('.type-choice.active')?.dataset.type || 'Carousel';
    const count = document.querySelector('#scheduled-count');
    count.textContent = String(Number(count.textContent) + 1);
    closeModal();
    form.reset();
    document.querySelectorAll('.type-choice').forEach((choice, index) => choice.classList.toggle('active', index === 0));
    showToast(`${title} added as a ${contentType.toLowerCase()} and scheduled`);
  });

  const dropZone = document.querySelector('#drop-zone');
  const fileInput = document.querySelector('#file-input');
  const handleFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    dropZone.querySelector('strong').textContent = file.name;
    dropZone.querySelector('span').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready to attach`;
    dropZone.classList.add('dragging');
  };
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
  ['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); if (eventName === 'drop') handleFiles(event.dataTransfer.files); else dropZone.classList.remove('dragging'); }));

  const bulkDropZone = document.querySelector('#bulk-drop-zone');
  const bulkFileInput = document.querySelector('#bulk-file-input');
  const handleBulkFiles = (files) => {
    const amount = files?.length || 0;
    if (!amount) return;
    bulkDropZone.querySelector('strong').textContent = `${amount} media files ready to schedule`;
    bulkDropZone.querySelector('span').textContent = 'Mixed media accepted · Ready to add to your batch';
    bulkDropZone.classList.add('dragging');
  };
  bulkDropZone.addEventListener('click', () => bulkFileInput.click());
  bulkFileInput.addEventListener('change', (event) => handleBulkFiles(event.target.files));
  ['dragenter', 'dragover'].forEach((eventName) => bulkDropZone.addEventListener(eventName, (event) => { event.preventDefault(); bulkDropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((eventName) => bulkDropZone.addEventListener(eventName, (event) => { event.preventDefault(); if (eventName === 'drop') handleBulkFiles(event.dataTransfer.files); else bulkDropZone.classList.remove('dragging'); }));

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('active'));
      item.classList.add('active');
      const view = item.dataset.view;
      const targets = {
        overview: '.welcome-row',
        calendar: '.calendar-panel',
        library: '.recent-panel',
        analytics: '.best-time-panel',
        inbox: '.queue-panel',
        team: '.profile-row',
        settings: '.profile-row'
      };
      const target = document.querySelector(targets[view] || '.welcome-row');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const heading = target.querySelector('h1, h2, strong');
        const crumb = document.querySelector('.breadcrumbs strong');
        if (crumb) crumb.textContent = item.querySelector('span:nth-child(2)')?.textContent || 'Overview';
        showToast((item.querySelector('span:nth-child(2)')?.textContent || 'View') + ' opened');
      }
    });
  });

  document.querySelectorAll('[data-calendar-view]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-calendar-view]').forEach((option) => option.classList.remove('active'));
      button.classList.add('active');
      const calendar = document.querySelector('#week-calendar');
      if (!calendar) return;
      if (button.dataset.calendarView === 'month') {
        calendar.classList.add('month-view-requested');
        showToast('Month view selected. Saved posts are listed in the Content Library.');
      } else {
        calendar.classList.remove('month-view-requested');
        showToast('Week view selected');
      }
    });
  });

  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'upload') openModal();
    if (action === 'bulk') openModal('bulk');
    if (action === 'caption') { openModal(); window.setTimeout(() => document.querySelector('#content-caption')?.focus(), 100); }
    if (action === 'invite') showToast('Invite link copied to your clipboard');
  }));

  document.querySelector('#view-calendar')?.addEventListener('click', () => {
    document.querySelector('.calendar-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Calendar brought into view');
  });
  document.querySelector('#open-library')?.addEventListener('click', () => {
    document.querySelector('.recent-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Content Library brought into view');
  });
  document.querySelectorAll('.empty-day-button').forEach((button) => button.addEventListener('click', openModal));
  document.querySelector('.notification-button')?.addEventListener('click', () => showToast('You have 7 new inbox notifications'));
  document.querySelector('.pro-button')?.addEventListener('click', () => showToast('Pro features are ready when you are'));
  document.querySelector('.workspace-switcher')?.addEventListener('click', () => showToast('Workspace switcher opened'));
});
