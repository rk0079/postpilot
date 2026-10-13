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
    fullCalendar.hidden = false; pageContent.hidden = true;
    const crumb=document.querySelector('.breadcrumbs strong'); if(crumb) crumb.textContent='Calendar';
    renderFullCalendar();
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const closeFullCalendar = () => { fullCalendar.hidden=true; pageContent.hidden=false; const crumb=document.querySelector('.breadcrumbs strong'); if(crumb) crumb.textContent='Overview'; };
  window.addEventListener('postpilot:posts-updated', event => { calendarPosts=Array.isArray(event.detail?.posts)?event.detail.posts:[]; renderFullCalendar(); });

  // Real sidebar routing: Overview is a route, not just a scroll target.
  const setActiveNav = (view) => {
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.toggle('active', nav.dataset.view === view));
  };

  const showOverview = ({updateUrl = true} = {}) => {
    if (!fullCalendar.hidden) closeFullCalendar();
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
      openFullCalendar();
      if (window.location.hash !== '#calendar') {
        history.pushState({view:'calendar'}, '', '#calendar');
      }
      return;
    }

    if (!fullCalendar.hidden) closeFullCalendar();
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
