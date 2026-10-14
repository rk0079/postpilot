document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  // Keep date inputs usable instead of leaving the original 2024 demo dates.
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  ["#schedule-date", "#bulk-start-date"].forEach((selector) => {
    const input = document.querySelector(selector);
    if (input && (!input.value || input.value < localDate)) input.value = localDate;
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

  // Saving is handled only by supabase-integration.js. Never show a fake success state.

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

  // A dedicated, date-navigable calendar view backed by the user's saved Supabase posts.
  let calendarPosts = [];
  let calendarDate = new Date();
  let calendarMode = 'month';
  let calendarFilter = 'all';
  const mainArea = document.querySelector('.main-area');
  const pageContent = document.querySelector('.page-content');
  const fullCalendar = document.createElement('section');
  fullCalendar.id = 'full-calendar-view';
  fullCalendar.hidden = true;
  fullCalendar.innerHTML = `
    <div class="full-calendar-shell">
      <div class="full-calendar-title-row"><div><div class="section-kicker">PUBLISHING WORKSPACE</div><h1>Content calendar</h1><p>Plan every post, all in one place.</p></div>
        <button type="button" class="primary-button" id="full-calendar-create"><i data-lucide="plus"></i> Create post</button></div>
      <div class="full-calendar-toolbar"><div class="calendar-date-navigation"><button type="button" class="calendar-nav-arrow" id="calendar-prev" aria-label="Previous period"><i data-lucide="chevron-left"></i></button><button type="button" class="calendar-today-button" id="calendar-today">Today</button><button type="button" class="calendar-nav-arrow" id="calendar-next" aria-label="Next period"><i data-lucide="chevron-right"></i></button><h2 id="full-calendar-period"></h2></div>
        <div class="full-calendar-controls"><select id="calendar-filter" aria-label="Filter posts"><option value="all">All content</option><option value="scheduled">Scheduled</option><option value="draft">Drafts</option><option value="published">Published</option></select><div class="view-toggle"><button class="toggle-option" type="button" data-full-calendar-view="week">Week</button><button class="toggle-option active" type="button" data-full-calendar-view="month">Month</button></div></div></div>
      <div class="calendar-legend"><span><i class="calendar-legend-dot scheduled"></i> Scheduled</span><span><i class="calendar-legend-dot draft"></i> Draft</span><span><i class="calendar-legend-dot published"></i> Published</span><span class="calendar-zone-label">Local time · GMT+5:30</span></div>
      <div id="full-calendar-grid" class="full-calendar-grid" aria-live="polite"></div>
      <div class="calendar-unscheduled" id="calendar-unscheduled" hidden></div>
    </div>`;
  mainArea.insertBefore(fullCalendar, pageContent);
  if (window.lucide) window.lucide.createIcons();

  const dateKey = (date) => {
    const d = new Date(date);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  };
  const monthLabel = (date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const startOfWeek = (date) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d; };
  const filteredCalendarPosts = () => calendarPosts.filter(post => calendarFilter === 'all' || post.status === calendarFilter);
  const postsForDay = (date) => filteredCalendarPosts().filter(post => post.scheduled_at && dateKey(new Date(post.scheduled_at)) === dateKey(date));
  const statusLabel = (status) => status === 'scheduled' ? 'Scheduled' : status === 'published' ? 'Published' : 'Draft';
  let libraryPosts = [];

  const libraryStatusLabel = (status) => status === 'published' ? 'Published' : status === 'scheduled' ? 'Scheduled' : 'Draft';
  const openLibraryPage = () => {
    analyticsView.hidden = true;
    fullCalendar.hidden = true;
    pageContent.hidden = true;
    let libraryView = document.querySelector('#content-library-view');
    if (!libraryView) {
      libraryView = document.createElement('section');
      libraryView.id = 'content-library-view';
      libraryView.className = 'content-library-page';
      mainArea.insertBefore(libraryView, pageContent);
    }
    libraryView.hidden = false;
    setActiveNav('library');
    const crumb = document.querySelector('.breadcrumbs strong');
    if (crumb) crumb.textContent = 'Content library';
    renderLibrary();
    window.scrollTo({top:0, behavior:'smooth'});
  };

  const closeLibraryPage = () => {
    const libraryView = document.querySelector('#content-library-view');
    if (libraryView) libraryView.hidden = true;
    pageContent.hidden = false;
  };

  const renderLibrary = () => {
    const libraryView = document.querySelector('#content-library-view');
    if (!libraryView) return;
    const total = libraryPosts.length;
    const scheduled = libraryPosts.filter(p => p.status === 'scheduled').length;
    const drafts = libraryPosts.filter(p => p.status === 'draft').length;
    const published = libraryPosts.filter(p => p.status === 'published').length;

    libraryView.innerHTML = `
      <div class="full-calendar-shell">
        <div class="full-calendar-title-row">
          <div><div class="section-kicker">CONTENT WORKSPACE</div><h1>Content library</h1><p>All your saved posts, drafts and scheduled content in one place.</p></div>
          <button type="button" class="primary-button" id="library-create"><i data-lucide="plus"></i> Create post</button>
        </div>
        <div class="library-summary-grid">
          <div class="library-summary-card"><span>Total content</span><strong>${total}</strong></div>
          <div class="library-summary-card"><span>Scheduled</span><strong>${scheduled}</strong></div>
          <div class="library-summary-card"><span>Drafts</span><strong>${drafts}</strong></div>
          <div class="library-summary-card"><span>Published</span><strong>${published}</strong></div>
        </div>
        <div class="library-toolbar">
          <label class="library-search"><i data-lucide="search"></i><input id="library-search-input" type="search" placeholder="Search content..." aria-label="Search content"></label>
          <select id="library-status-filter" aria-label="Filter content"><option value="all">All status</option><option value="scheduled">Scheduled</option><option value="draft">Drafts</option><option value="published">Published</option></select>
          <button type="button" class="secondary-button" id="library-refresh"><i data-lucide="refresh-cw"></i> Refresh</button>
        </div>
        <div class="library-list" id="library-list" aria-live="polite"></div>
      </div>`;
    if (window.lucide) window.lucide.createIcons();

    const paint = () => {
      const query = (document.querySelector('#library-search-input')?.value || '').trim().toLowerCase();
      const filter = document.querySelector('#library-status-filter')?.value || 'all';
      const items = libraryPosts.filter(post => {
        const haystack = [post.title, post.caption, post.content_type, post.status].join(' ').toLowerCase();
        return (filter === 'all' || post.status === filter) && (!query || haystack.includes(query));
      });
      const list = document.querySelector('#library-list');
      if (!list) return;
      if (!items.length) {
        list.innerHTML = '<div class="library-empty"><i data-lucide="folder-open"></i><strong>No content found</strong><span>Try another search or create a new post.</span></div>';
      } else {
        list.innerHTML = items.map(post => {
          const date = post.scheduled_at ? new Date(post.scheduled_at).toLocaleString([], {dateStyle:'medium', timeStyle:'short'}) : 'No date set';
          const approval = post.approval_status === 'pending' ? ' · Awaiting approval' : post.approval_status === 'failed' ? ' · Publish failed' : '';
          const caption = (post.caption || 'No caption added').replace(/\s+/g,' ').slice(0,110);
          return `<article class="library-item">
            <div class="library-item-thumb">${post.media_url ? '<i data-lucide="image"></i>' : '<i data-lucide="file-text"></i>'}</div>
            <div class="library-item-main"><div class="library-item-title-row"><strong>${escapeHtml(post.title || 'Untitled content')}</strong><span class="status-tag status-${escapeHtml(post.status || 'draft')}"><i></i>${libraryStatusLabel(post.status)}${approval}</span></div><p>${escapeHtml(caption)}</p><small>${escapeHtml(post.content_type || 'post')} · ${escapeHtml(date)}</small></div>
            <div class="library-item-actions">
              <button type="button" class="row-menu publish-action" data-library-copy="${escapeHtml(post.id)}">Copy caption</button>
              <button type="button" class="row-menu" data-library-instagram="${escapeHtml(post.id)}">Open Instagram</button>
            </div>
          </article>`;
        }).join('');
      }
      if (window.lucide) window.lucide.createIcons();
    };
    document.querySelector('#library-search-input')?.addEventListener('input', paint);
    document.querySelector('#library-status-filter')?.addEventListener('change', paint);
    document.querySelector('#library-refresh')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('postpilot:library-refresh'));
      paint();
    });
    document.querySelector('#library-create')?.addEventListener('click', () => openModal());
    libraryView.onclick = async (event) => {
      const copy = event.target.closest('[data-library-copy]');
      const instagram = event.target.closest('[data-library-instagram]');
      if (copy) {
        const post = libraryPosts.find(p => p.id === copy.dataset.libraryCopy);
        if (post) {
          const text = [post.caption || '', ...(Array.isArray(post.hashtags) ? post.hashtags : [])].filter(Boolean).join(' ');
          try { await navigator.clipboard.writeText(text); showToast('Caption copied to clipboard.'); } catch (_) { showToast('Could not copy caption.'); }
        }
      }
      if (instagram) window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    };
    paint();
  };

  window.addEventListener('postpilot:posts-updated', event => {
    libraryPosts = Array.isArray(event.detail?.posts) ? event.detail.posts : [];
    if (window.location.hash === '#library') renderLibrary();
  });

  const openComposerForDate = (date) => {
    const dateInput = document.querySelector('#schedule-date');
    if (dateInput) dateInput.value = dateKey(date);
    const timeInput = document.querySelector('#schedule-time');
    if (timeInput) timeInput.value = '19:00';
    const modal = document.querySelector('#modal-backdrop');
    if (modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
    document.querySelector('#content-title')?.focus();
  };
  const renderFullCalendar = () => {
    const grid = document.querySelector('#full-calendar-grid');
    const period = document.querySelector('#full-calendar-period');
    if (!grid || !period) return;
    grid.innerHTML = '';
    const unscheduled = filteredCalendarPosts().filter(post => !post.scheduled_at || post.status === 'draft' && !post.scheduled_at);
    const todayKey = dateKey(new Date());
    if (calendarMode === 'month') {
      period.textContent = monthLabel(calendarDate);
      grid.className = 'full-calendar-grid month-grid';
      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(day => { const el=document.createElement('div'); el.className='calendar-weekday'; el.textContent=day; grid.appendChild(el); });
      const first = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
      const start = startOfWeek(first);
      const total = Math.ceil(((first.getDay()+6)%7 + new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,0).getDate())/7)*7;
      for(let i=0;i<total;i++) {
        const date = new Date(start); date.setDate(start.getDate()+i);
        const cell = document.createElement('div'); cell.className='calendar-day-cell'+(date.getMonth()!==calendarDate.getMonth()?' outside-month':'')+(dateKey(date)===todayKey?' is-today':'');
        const head=document.createElement('div'); head.className='calendar-day-head';
        const number=document.createElement('span'); number.className='calendar-day-number'; number.textContent=date.getDate(); head.appendChild(number);
        const add=document.createElement('button'); add.type='button'; add.className='calendar-slot-add'; add.setAttribute('aria-label','Create post on '+date.toLocaleDateString()); add.innerHTML='<i data-lucide="plus"></i>'; add.addEventListener('click',()=>openComposerForDate(date)); head.appendChild(add); cell.appendChild(head);
        postsForDay(date).forEach(post => { const card=document.createElement('button'); card.type='button'; card.className='calendar-post-chip '+(post.status||'draft'); card.title=(post.title||'Untitled content')+' · '+statusLabel(post.status); card.innerHTML='<span class="calendar-chip-time"></span><span class="calendar-chip-title"></span>'; card.querySelector('.calendar-chip-time').textContent=post.scheduled_at?new Date(post.scheduled_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''; card.querySelector('.calendar-chip-title').textContent=post.title||'Untitled content'; card.addEventListener('click',()=>openComposerForDate(date)); cell.appendChild(card); });
        cell.addEventListener('dblclick',()=>openComposerForDate(date)); grid.appendChild(cell);
      }
    } else {
      const start=startOfWeek(calendarDate); const end=new Date(start); end.setDate(start.getDate()+6);
      period.textContent=start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+end.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
      grid.className='full-calendar-grid week-grid';
      const gutter=document.createElement('div'); gutter.className='week-time-gutter'; gutter.innerHTML='<div class="week-gutter-spacer"></div>'+Array.from({length:14},(_,i)=>'<div class="week-hour-label">'+String(i+7).padStart(2,'0')+':00</div>').join(''); grid.appendChild(gutter);
      for(let i=0;i<7;i++) {
        const date=new Date(start); date.setDate(start.getDate()+i);
        const col=document.createElement('div'); col.className='week-day-column'+(dateKey(date)===todayKey?' is-today':'');
        const head=document.createElement('div'); head.className='week-day-heading'; head.innerHTML='<span></span><button type="button" class="calendar-slot-add" aria-label="Create post on this date"><i data-lucide="plus"></i></button>'; head.querySelector('span').textContent=date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}); head.querySelector('button').addEventListener('click',()=>openComposerForDate(date)); col.appendChild(head);
        for(let hour=7;hour<21;hour++){const slot=document.createElement('button');slot.type='button';slot.className='week-time-slot';slot.setAttribute('aria-label','Create post '+hour+':00 on '+date.toLocaleDateString());slot.addEventListener('click',()=>{openComposerForDate(date);const time=document.querySelector('#schedule-time');if(time)time.value=String(hour).padStart(2,'0')+':00';});col.appendChild(slot);}
        postsForDay(date).forEach(post=>{const card=document.createElement('div');card.className='week-calendar-post '+(post.status||'draft');const title=document.createElement('strong');title.textContent=post.title||'Untitled content';const time=document.createElement('span');time.textContent=new Date(post.scheduled_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});card.append(time,title);col.appendChild(card);});
        grid.appendChild(col);
      }
    }
    const unscheduledPanel=document.querySelector('#calendar-unscheduled');
    if(unscheduledPanel){unscheduledPanel.hidden=!unscheduled.length;unscheduledPanel.innerHTML='';if(unscheduled.length){const title=document.createElement('h3');title.textContent='Needs a date · '+unscheduled.length;unscheduledPanel.appendChild(title);unscheduled.forEach(post=>{const item=document.createElement('button');item.type='button';item.className='unscheduled-post';item.textContent=post.title||'Untitled draft';item.addEventListener('click',()=>openComposerForDate(calendarDate));unscheduledPanel.appendChild(item);});}}
    if(window.lucide) window.lucide.createIcons();
  };
  const openFullCalendar = () => {
    analyticsView.hidden = true;
    fullCalendar.hidden = false; pageContent.hidden = true;
    const crumb=document.querySelector('.breadcrumbs strong'); if(crumb) crumb.textContent='Calendar';
    renderFullCalendar();
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const closeFullCalendar = () => { fullCalendar.hidden=true; pageContent.hidden=false; const crumb=document.querySelector('.breadcrumbs strong'); if(crumb) crumb.textContent='Overview'; };
  window.addEventListener('postpilot:posts-updated', event => { calendarPosts=Array.isArray(event.detail?.posts)?event.detail.posts:[]; renderFullCalendar(); });


  // Instagram Analytics: display only metrics returned by the authenticated Meta Insights API.
  const analyticsView = document.createElement('section');
  analyticsView.id = 'postpilot-analytics-view';
  analyticsView.hidden = true;
  mainArea.insertBefore(analyticsView, pageContent);
  let analyticsDays = 30;
  let analyticsPayload = null;
  let analyticsError = '';
  let analyticsLoading = false;
  const analyticsEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const analyticsNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat().format(value) : '—';
  const analyticsMetrics = [
    { key: 'reach', label: 'Reach', icon: 'users', hint: 'Unique accounts reached' },
    { key: 'views', label: 'Views', icon: 'eye', hint: 'Content views' },
    { key: 'accounts_engaged', label: 'Engaged accounts', icon: 'heart-handshake', hint: 'Accounts that engaged' },
    { key: 'total_interactions', label: 'Interactions', icon: 'heart', hint: 'Total content interactions' },
    { key: 'profile_views', label: 'Profile visits', icon: 'user-round', hint: 'Profile views' },
    { key: 'profile_links_taps', label: 'Link taps', icon: 'mouse-pointer-click', hint: 'Profile link taps' },
    { key: 'follows_and_unfollows', label: 'Follower activity', icon: 'user-plus', hint: 'Follows and unfollows' }
  ];
  const analyticsMetricValue = (key) => {
    const metric = analyticsPayload?.metrics?.[key];
    return metric?.available ? analyticsNumber(metric.total) : '—';
  };
  const analyticsFormatDate = (value) => {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const renderAnalytics = () => {
    const payload = analyticsPayload;
    const metricsHtml = analyticsMetrics.map(metric => {
      const result = payload?.metrics?.[metric.key];
      const available = Boolean(result?.available && result.total !== null);
      return '<article class="analytics-metric-card"><div class="analytics-metric-head"><span>' + metric.label + '</span><i data-lucide="' + metric.icon + '"></i></div><strong>' + (available ? analyticsNumber(result.total) : '—') + '</strong><small>' + (available ? metric.hint : 'Not provided by Instagram for this account') + '</small></article>';
    }).join('');
    const series = payload?.metrics?.reach?.series?.length ? payload.metrics.reach.series : (payload?.metrics?.views?.series || []);
    const chartValues = series.filter(item => typeof item.value === 'number');
    const chartMax = Math.max(1, ...chartValues.map(item => item.value));
    const chartHtml = chartValues.length
      ? '<div class="analytics-chart-bars">' + chartValues.map((item, index) => '<div class="analytics-chart-column" title="' + analyticsEscape(item.date) + ': ' + analyticsNumber(item.value) + '"><div class="analytics-bar-track"><span style="height:' + Math.max(3, Math.round(item.value / chartMax * 100)) + '%"></span></div><small>' + (index === 0 || index === chartValues.length - 1 || index % Math.max(1, Math.floor(chartValues.length / 6)) === 0 ? analyticsEscape(analyticsFormatDate(item.date)) : '') + '</small></div>').join('') + '</div>'
      : '<div class="analytics-empty-chart"><i data-lucide="chart-no-axes-combined"></i><strong>No trend data returned</strong><span>Instagram may not provide daily insights for this account or selected period.</span></div>';
    const posts = Array.isArray(payload?.topPosts) ? payload.topPosts : [];
    const topPostsHtml = posts.length ? posts.slice(0, 8).map((post, index) => {
      const label = (post.caption || 'Instagram post').replace(/\s+/g, ' ').slice(0, 115);
      const engagement = (typeof post.likes === 'number' ? post.likes : 0) + (typeof post.comments === 'number' ? post.comments : 0);
      return '<article class="analytics-post-row"><span class="analytics-post-rank">' + (index + 1) + '</span><div class="analytics-post-main"><strong>' + analyticsEscape(label) + '</strong><small>' + analyticsEscape(String(post.mediaType || 'POST').replaceAll('_', ' ')) + ' · ' + analyticsEscape(analyticsFormatDate(post.timestamp)) + '</small></div><div class="analytics-post-stat"><strong>' + analyticsNumber(post.reach) + '</strong><small>Reach</small></div><div class="analytics-post-stat"><strong>' + analyticsNumber(post.likes) + '</strong><small>Likes</small></div><div class="analytics-post-stat"><strong>' + analyticsNumber(post.comments) + '</strong><small>Comments</small></div>' + (post.permalink ? '<a class="analytics-post-link" href="' + analyticsEscape(post.permalink) + '" target="_blank" rel="noopener noreferrer" aria-label="Open post"><i data-lucide="arrow-up-right"></i></a>' : '') + '</article>';
    }).join('') : '<div class="analytics-empty-chart"><i data-lucide="images"></i><strong>No posts returned for this period</strong><span>Try a wider date range or check that Instagram insights access is enabled.</span></div>';
    const typeTotals = {};
    posts.forEach(post => {
      const type = String(post.mediaType || 'POST').replaceAll('_', ' ');
      if (!typeTotals[type]) typeTotals[type] = { count: 0, reach: 0, engagement: 0 };
      typeTotals[type].count += 1;
      typeTotals[type].reach += typeof post.reach === 'number' ? post.reach : 0;
      typeTotals[type].engagement += (typeof post.likes === 'number' ? post.likes : 0) + (typeof post.comments === 'number' ? post.comments : 0);
    });
    const typeHtml = Object.keys(typeTotals).length ? Object.entries(typeTotals).map(([type, stats]) => '<div class="analytics-type-row"><span>' + analyticsEscape(type) + '</span><strong>' + stats.count + ' posts</strong><small>' + analyticsNumber(stats.reach) + ' reach · ' + analyticsNumber(stats.engagement) + ' likes/comments</small></div>').join('') : '<p class="analytics-muted">Content-type breakdown will appear when Instagram returns post data.</p>';
    const timeStats = {};
    posts.forEach(post => {
      if (!post.timestamp) return;
      const date = new Date(post.timestamp);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toLocaleDateString(undefined, { weekday: 'short' }) + ' · ' + date.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
      if (!timeStats[key]) timeStats[key] = { score: 0, count: 0 };
      timeStats[key].score += typeof post.reach === 'number' ? post.reach : ((post.likes || 0) + (post.comments || 0));
      timeStats[key].count += 1;
    });
    const bestTime = Object.entries(timeStats).sort((a,b) => b[1].score - a[1].score)[0];
    const timeHtml = bestTime ? '<div class="analytics-best-time"><i data-lucide="clock-3"></i><div><strong>' + analyticsEscape(bestTime[0]) + '</strong><span>Highest combined performance among the returned posts (' + bestTime[1].count + ' post' + (bestTime[1].count === 1 ? '' : 's') + '). This is an estimate, not a full audience-activity forecast.</span></div></div>' : '<p class="analytics-muted">Not enough published-post timestamps to estimate a best time yet.</p>';
    let stateHtml = '';
    if (analyticsLoading) stateHtml = '<div class="analytics-notice"><span class="analytics-spinner"></span> Fetching live Instagram insights…</div>';
    else if (analyticsError) stateHtml = '<div class="analytics-notice analytics-notice-error"><i data-lucide="alert-circle"></i><div><strong>Analytics could not be loaded</strong><p>' + analyticsEscape(analyticsError) + '</p><small>If Instagram is not connected, open Overview and use “Connect Instagram Business”. Insights also require the Meta permission for account insights.</small></div><button type="button" class="secondary-button" data-analytics-retry>Try again</button></div>';
    else if (payload?.partial) stateHtml = '<div class="analytics-notice analytics-notice-info"><i data-lucide="info"></i><span>Some metrics are unavailable for this account or date range. Unavailable metrics are shown as dashes, not estimated values.</span></div>';
    analyticsView.innerHTML = '<div class="analytics-page-shell"><div class="analytics-page-heading"><div><div class="section-kicker">INSTAGRAM PERFORMANCE</div><h1>Analytics</h1><p>Real account and post insights from your connected Instagram account.</p></div><div class="analytics-controls"><label>Period <select id="analytics-period"><option value="7"' + (analyticsDays === 7 ? ' selected' : '') + '>Last 7 days</option><option value="30"' + (analyticsDays === 30 ? ' selected' : '') + '>Last 30 days</option><option value="90"' + (analyticsDays === 90 ? ' selected' : '') + '>Last 90 days</option></select></label><button type="button" class="primary-button" data-analytics-retry><i data-lucide="refresh-cw"></i> Refresh</button></div></div>' + stateHtml + '<div class="analytics-metric-grid">' + metricsHtml + '</div><div class="analytics-two-col"><article class="panel analytics-panel"><div class="panel-heading"><div><div class="section-kicker">DAILY TREND</div><h2>Reach over time</h2></div><span class="analytics-live-pill"><i></i> Live data</span></div>' + chartHtml + '<p class="analytics-footnote">Values are taken directly from Instagram Insights. Daily reach is not additive unique reach across the full period.</p></article><article class="panel analytics-panel"><div class="panel-heading"><div><div class="section-kicker">PUBLISHING INSIGHT</div><h2>Best-performing time</h2></div></div>' + timeHtml + '<div class="analytics-divider"></div><div class="section-kicker">CONTENT TYPE</div><div class="analytics-type-list">' + typeHtml + '</div></article></div><article class="panel analytics-panel analytics-top-posts"><div class="panel-heading"><div><div class="section-kicker">CONTENT PERFORMANCE</div><h2>Top posts</h2></div><span class="analytics-subtle">' + posts.length + ' posts returned</span></div><div class="analytics-post-list">' + topPostsHtml + '</div></article><p class="analytics-disclaimer">Metrics are subject to Instagram API availability, account type, permissions, and Meta’s reporting limits. PostPilot does not fill missing data with demo values.</p></div>';
    if (window.lucide) window.lucide.createIcons();
  };
  const loadAnalytics = async () => {
    analyticsLoading = true;
    analyticsError = '';
    renderAnalytics();
    try {
      if (typeof window.postpilotFetchInsights !== 'function') throw new Error('Analytics connection is still initializing. Please retry in a moment.');
      const data = await window.postpilotFetchInsights(analyticsDays);
      if (!data?.connected) throw new Error('Connect your Instagram account to load insights.');
      analyticsPayload = data;
    } catch (error) {
      analyticsError = error?.message || 'Instagram insights are currently unavailable.';
      analyticsPayload = null;
    } finally {
      analyticsLoading = false;
      renderAnalytics();
    }
  };
  const openAnalyticsPage = () => {
    if (!fullCalendar.hidden) fullCalendar.hidden = true;
    const libraryView = document.querySelector('#content-library-view');
    if (libraryView) libraryView.hidden = true;
    analyticsView.hidden = false;
    pageContent.hidden = true;
    setActiveNav('analytics');
    const crumb = document.querySelector('.breadcrumbs strong');
    if (crumb) crumb.textContent = 'Analytics';
    renderAnalytics();
    loadAnalytics();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  analyticsView.addEventListener('change', (event) => {
    if (event.target.id === 'analytics-period') {
      analyticsDays = Number(event.target.value);
      loadAnalytics();
    }
  });
  analyticsView.addEventListener('click', (event) => {
    if (event.target.closest('[data-analytics-retry]')) loadAnalytics();
    if (event.target.closest('[data-analytics-overview]')) {
      const overview = document.querySelector('.nav-item[data-view="overview"]');
      if (overview) navigateSidebar('overview', overview);
    }
  });

  // Real sidebar routing: Overview is a route, not just a scroll target.
  const setActiveNav = (view) => {
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.toggle('active', nav.dataset.view === view));
  };

  const showOverview = ({updateUrl = true} = {}) => {
    if (!fullCalendar.hidden) closeFullCalendar();
    analyticsView.hidden = true;
    pageContent.hidden = false;
    setActiveNav('overview');
    const crumb = document.querySelector('.breadcrumbs strong');
    if (crumb) crumb.textContent = 'Overview';
    if (updateUrl && window.location.hash !== '#overview') {
      history.pushState({view:'overview'}, '', '#overview');
    }
    window.scrollTo({top:0, behavior:'smooth'});
  };

  const navigateSidebar = (view, item) => {
    if (view === 'overview') {
      showOverview();
      return;
    }

    if (view === 'calendar') {
      setActiveNav('calendar');
      closeLibraryPage();
      openFullCalendar();
      if (window.location.hash !== '#calendar') {
        history.pushState({view:'calendar'}, '', '#calendar');
      }
      return;
    }

    if (view === 'analytics') {
      if (!fullCalendar.hidden) closeFullCalendar();
      closeLibraryPage();
      openAnalyticsPage();
      if (window.location.hash !== '#analytics') history.pushState({view:'analytics'}, '', '#analytics');
      return;
    }

    if (view === 'library') {
      analyticsView.hidden = true;
      openLibraryPage();
      if (window.location.hash !== '#library') {
        history.pushState({view:'library'}, '', '#library');
      }
      return;
    }

    if (!fullCalendar.hidden) closeFullCalendar();
    analyticsView.hidden = true;
    closeLibraryPage();
    setActiveNav(view);

    const crumb = document.querySelector('.breadcrumbs strong');
    if (crumb) crumb.textContent = item.querySelector('span:nth-child(2)')?.textContent || view;

    // Library gets its own route foundation; the full Library page comes next.
    if (view === 'library') {
      document.querySelector('.recent-panel')?.scrollIntoView({behavior:'smooth', block:'start'});
      if (window.location.hash !== '#library') {
        history.pushState({view:'library'}, '', '#library');
      }
      return;
    }

    showToast(({analytics:'Analytics page will be implemented next.',inbox:'Social Inbox page will be implemented next.',team:'Team & Roles page will be implemented next.',settings:'Settings page will be implemented next.'})[view] || 'This section will be implemented next.');
  };

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => navigateSidebar(item.dataset.view, item));
  });

  window.addEventListener('popstate', () => {
    const view = window.location.hash.replace('#','') || 'overview';
    const item = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (item) navigateSidebar(view, item);
    else showOverview({updateUrl:false});
  });

  if (!window.location.hash) {
    history.replaceState({view:'overview'}, '', '#overview');
  } else {
    const initialView = window.location.hash.replace('#', '');
    const initialItem = document.querySelector('.nav-item[data-view="' + initialView + '"]');
    if (initialItem && initialView !== 'overview') navigateSidebar(initialView, initialItem);
  }
  document.querySelector('#full-calendar-create')?.addEventListener('click',()=>openComposerForDate(calendarDate));
  document.querySelector('#calendar-prev')?.addEventListener('click',()=>{if(calendarMode==='month')calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);else{calendarDate.setDate(calendarDate.getDate()-7);}renderFullCalendar();});
  document.querySelector('#calendar-next')?.addEventListener('click',()=>{if(calendarMode==='month')calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);else{calendarDate.setDate(calendarDate.getDate()+7);}renderFullCalendar();});
  document.querySelector('#calendar-today')?.addEventListener('click',()=>{calendarDate=new Date();renderFullCalendar();});
  document.querySelector('#calendar-filter')?.addEventListener('change',event=>{calendarFilter=event.target.value;renderFullCalendar();});
  document.querySelectorAll('[data-full-calendar-view]').forEach(button=>button.addEventListener('click',()=>{calendarMode=button.dataset.fullCalendarView;document.querySelectorAll('[data-full-calendar-view]').forEach(b=>b.classList.toggle('active',b===button));renderFullCalendar();}));
  document.querySelectorAll('[data-calendar-view]').forEach(button => button.addEventListener('click', () => {
    const view=button.dataset.calendarView;
    if(view==='month'||view==='week'){openFullCalendar();calendarMode=view;document.querySelectorAll('[data-full-calendar-view]').forEach(b=>b.classList.toggle('active',b.dataset.fullCalendarView===view));renderFullCalendar();}
  }));

  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'upload') openModal();
    if (action === 'bulk') openModal('bulk');
    if (action === 'caption') { openModal(); window.setTimeout(() => document.querySelector('#content-caption')?.focus(), 100); }
    if (action === 'invite') showToast('Team invitations are not available yet.');
  }));

  document.querySelector('#view-calendar')?.addEventListener('click', () => { openFullCalendar(); });
  document.querySelector('#open-library')?.addEventListener('click', () => {
    document.querySelector('.recent-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Content Library brought into view');
  });
  document.querySelectorAll('.empty-day-button').forEach((button) => button.addEventListener('click', openModal));
  document.querySelector('.notification-button')?.addEventListener('click', () => showToast('Notifications are currently limited to reminders you set for individual posts.'));
  document.querySelector('.pro-button')?.addEventListener('click', () => showToast('Paid plans are not configured in this version.'));
  document.querySelector('.workspace-switcher')?.addEventListener('click', () => showToast('This account currently has one workspace.'));
});
