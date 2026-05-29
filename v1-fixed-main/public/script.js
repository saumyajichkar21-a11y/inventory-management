// script.js — RFID Inventory · Redesigned Frontend
'use strict';

let containers    = [];
let activePanelId = null;
let pollTimer     = null;
const POLL_MS     = 30000;

async function apiFetch(url, options = {}) {
  const res  = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function apiGet(path)        { return apiFetch(path); }
async function apiPost(path, body) { return apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); }

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initSidebar();
  initPanelClose();
  loadInventory();
  startPoll();
});

// ── Clock ──────────────────────────────────────────────────
function initClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };
  tick(); setInterval(tick, 1000);
}

// ── Sidebar nav ────────────────────────────────────────────
function initSidebar() {
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// ── Polling ────────────────────────────────────────────────
function startPoll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => loadInventory(true), POLL_MS);
}

// ── Load inventory ─────────────────────────────────────────
async function loadInventory(silent = false) {
  setStatus('loading');
  try {
    const data = await apiGet('/api/inventory');
    containers = data.containers || [];
    renderStats();
    renderContainers();
    renderActivityFromContainers(containers);
    if (activePanelId) refreshPanelData(activePanelId);
    setStatus('online');
    setLastSync();
  } catch (err) {
    setStatus('offline');
    if (!silent) showToast('Failed to load: ' + err.message, 'error');
  }
}

function setLastSync() {
  const el = document.getElementById('last-sync');
  if (el) el.textContent = 'synced ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function setStatus(state) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot) return;
  dot.classList.toggle('online', state === 'online');
  if (text) text.textContent = state === 'online' ? 'ONLINE' : state === 'loading' ? 'SYNCING' : 'OFFLINE';
}

// ── Stats ──────────────────────────────────────────────────
function renderStats() {
  const empty    = containers.filter(c => c.status === 'EMPTY').length;
  const lowStock = containers.filter(c => c.status === 'LOW STOCK').length;
  const totalQty = containers.reduce((s, c) => s + c.quantity, 0);
  setText('stat-total', containers.length);
  setText('stat-qty',   totalQty);
  setText('stat-low',   lowStock);
  setText('stat-empty', empty);
  setText('sf-low',   lowStock);
  setText('sf-empty', empty);
  setText('sidebar-total-badge', containers.length);

  const badge = document.getElementById('sidebar-alert-badge');
  if (badge) {
    const n = lowStock + empty;
    badge.textContent = n;
    badge.className   = 'nav-badge' + (n > 0 ? ' alert' : '');
  }
}

// ── Container cards (smart diff — no DOM wipe) ─────────────
function renderContainers() {
  const grid = document.getElementById('container-grid');
  if (!grid) return;

  const existingCards = {};
  grid.querySelectorAll('.container-card[data-id]').forEach(el => {
    existingCards[el.dataset.id] = el;
  });

  const needsRebuild = containers.length !== Object.keys(existingCards).length;
  if (needsRebuild) grid.innerHTML = '';

  containers.forEach((c, i) => {
    const pct      = c.capacity > 0 ? Math.round((c.quantity / c.capacity) * 100) : 0;
    const barClass = c.status === 'FULL' ? 'full' : c.status === 'LOW STOCK' ? 'low' : c.status === 'EMPTY' ? 'empty' : '';

    if (!needsRebuild && existingCards[c.id]) {
      // Smart update — no flicker
      const card = existingCards[c.id];
      const pill = card.querySelector('.status-pill');
      if (pill) { pill.className = `status-pill ${c.status}`; pill.textContent = c.status; }
      const pLabel = card.querySelector('.card-progress-label');
      if (pLabel) {
        pLabel.querySelector('span:first-child').textContent = `${pct}%`;
        pLabel.querySelector('span:last-child').textContent  = `${c.quantity} / ${c.capacity}`;
      }
      const bar = card.querySelector('.card-bar');
      if (bar) { bar.style.width = `${pct}%`; bar.className = `card-bar ${barClass}`; }
      const qtyEl = card.querySelector('.card-qty-big');
      if (qtyEl) qtyEl.textContent = c.quantity;
      const capEl = card.querySelector('.card-cap-lbl');
      if (capEl) capEl.textContent = `of ${c.capacity}`;
      const logEl = card.querySelector('.card-logs-count');
      if (logEl) logEl.lastChild.textContent = ` ${(c.logs||[]).length} logs`;
      return;
    }

    // Build card for first time
    const div = document.createElement('div');
    div.className   = 'container-card';
    div.dataset.id  = c.id;
    div.tabIndex    = 0;
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', `Open ${c.name} details`);
    div.style.animationDelay = `${i * 0.07}s`;
    div.innerHTML = `
      <div class="card-top">
        <div>
          <div class="card-name">${escHtml(c.name)}</div>
          <div class="card-id">${c.id.toUpperCase()}</div>
        </div>
        <span class="status-pill ${c.status}">${c.status}</span>
      </div>
      <div class="card-progress-label">
        <span>${pct}%</span>
        <span>${c.quantity} / ${c.capacity}</span>
      </div>
      <div class="card-track">
        <div class="card-bar ${barClass}" style="width:${pct}%"></div>
      </div>
      <div class="card-bottom">
        <div>
          <div class="card-qty-big">${c.quantity}</div>
          <div class="card-cap-lbl">of ${c.capacity}</div>
        </div>
        <div class="card-logs-count">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M1 3h12M1 7h8M1 11h10"/>
          </svg>
           ${(c.logs||[]).length} logs
        </div>
      </div>`;
    grid.appendChild(div);
  });

  grid.onclick = e => {
    const card = e.target.closest('.container-card');
    if (card) openPanel(card.dataset.id);
  };
  grid.onkeydown = e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.container-card')) {
      e.preventDefault();
      openPanel(e.target.closest('.container-card').dataset.id);
    }
  };
}

// ── Activity feed ──────────────────────────────────────────
function renderActivityFromContainers(containers) {
  const logs = containers
    .flatMap(c => (c.logs || []).map(l => ({ ...l, containerName: c.name, containerId: c.id })))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 40);
  renderActivityFeed(logs);
}

function renderActivityFeed(logs) {
  const list  = document.getElementById('activity-list');
  const empty = document.getElementById('activity-empty');
  if (!list) return;
  if (!logs.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  const dotClass = l => l.source === 'rfid' ? 'rfid' : l.type;
  list.innerHTML = logs.map(l => `
    <div class="activity-item">
      <div class="activity-dot ${dotClass(l)}"></div>
      <div class="activity-desc">
        <strong>${escHtml(l.containerName || l.containerId)}</strong>
        · ${escHtml(l.productName || 'Item')} ×${l.quantity} → ${l.newTotal} total
      </div>
      <div class="activity-meta">
        <span class="activity-badge ${l.type}">${l.source === 'rfid' ? 'RFID' : l.type}</span>
        <div style="margin-top:3px">${timeAgo(l.timestamp)}</div>
      </div>
    </div>`).join('');
}

// ── Panel ──────────────────────────────────────────────────
function initPanelClose() {
  document.getElementById('btn-close-panel').onclick = closePanel;
  document.getElementById('panel-overlay').onclick   = closePanel;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && activePanelId) closePanel(); });
  document.getElementById('btn-save-capacity').onclick = saveCapacity;
  document.getElementById('btn-panel-add').onclick     = panelAdd;
  document.getElementById('btn-panel-remove').onclick  = panelRemove;
}

function openPanel(id) {
  activePanelId = id;
  document.getElementById('panel-overlay').classList.add('visible');
  document.getElementById('detail-panel').classList.add('open');
  renderPanel(id);
  document.body.style.overflow = 'hidden';
  loadInventory(true);
}

function closePanel() {
  activePanelId = null;
  document.getElementById('panel-overlay').classList.remove('visible');
  document.getElementById('detail-panel').classList.remove('open');
  document.body.style.overflow = '';
}

function refreshPanelData(id) {
  const c = containers.find(c => c.id === id);
  if (!c) return;
  const pct = c.capacity > 0 ? Math.round((c.quantity / c.capacity) * 100) : 0;
  setText('panel-stat-qty', c.quantity);
  setText('panel-stat-cap', c.capacity);
  setText('panel-stat-pct', pct + '%');
  const badge = document.getElementById('panel-status-badge');
  if (badge) { badge.textContent = c.status; badge.className = 'status-pill ' + c.status; }
  const bar = document.getElementById('panel-progress-bar');
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = c.status === 'LOW STOCK' ? 'var(--amber)' : c.status === 'EMPTY' ? 'var(--t3)' : c.status === 'FULL' ? 'var(--blue)' : 'var(--green)';
  }
  const removeBtn = document.getElementById('btn-panel-remove');
  if (removeBtn) removeBtn.disabled = c.quantity <= 0;
  renderPanelLogs(c.logs);
}

function renderPanel(id) {
  const c = containers.find(c => c.id === id);
  if (!c) return;
  setText('panel-title',    c.name);
  setText('panel-subtitle', `${c.id.toUpperCase()} · ${(c.logs||[]).length} entries`);
  document.getElementById('capacity-input').value = c.capacity;
  refreshPanelData(id);
}

function renderPanelLogs(logs) {
  const list = document.getElementById('panel-log-list');
  if (!list) return;
  if (!logs || !logs.length) {
    list.innerHTML = '<div class="log-empty">No transactions yet.</div>';
    return;
  }
  list.innerHTML = [...logs].reverse().slice(0, 60).map(l => `
    <div class="log-entry">
      <span class="log-type ${l.source === 'rfid' ? 'ADD' : l.type}">${l.source === 'rfid' ? 'RFID' : l.type}</span>
      <div class="log-desc">${escHtml(l.productName || 'Item')} ×${l.quantity} → ${l.newTotal}${l.uid ? ` <span style="color:var(--t3);font-family:var(--font-mono);font-size:10px">[${l.uid}]</span>` : ''}</div>
      <div class="log-time">${timeAgo(l.timestamp)}</div>
    </div>`).join('');
}

// ── Panel actions ──────────────────────────────────────────
async function panelAdd() {
  if (!activePanelId) return;
  const name = document.getElementById('product-name-input').value.trim() || 'Item';
  const qty  = parseInt(document.getElementById('qty-input').value, 10) || 1;
  await withLoading('btn-panel-add', async () => {
    const data = await apiPost('/api/add-product', { containerId: activePanelId, productName: name, quantity: qty });
    updateContainerInState(data.container);
    renderContainers(); renderStats(); renderPanel(activePanelId); renderActivityFromContainers(containers);
    showToast(`Added ${qty}× ${name}`, 'success');
    flashRfid(`+${qty} ${name}`, null);
  });
}

async function panelRemove() {
  if (!activePanelId) return;
  await loadInventory(true);
  const c = containers.find(c => c.id === activePanelId);
  if (!c || c.quantity <= 0) { showToast('Container is already empty', 'error'); return; }
  const name = document.getElementById('product-name-input').value.trim() || 'Item';
  const qty  = parseInt(document.getElementById('qty-input').value, 10) || 1;
  await withLoading('btn-panel-remove', async () => {
    const data = await apiPost('/api/remove-product', { containerId: activePanelId, productName: name, quantity: qty });
    updateContainerInState(data.container);
    renderContainers(); renderStats(); renderPanel(activePanelId); renderActivityFromContainers(containers);
    showToast(`Removed ${qty}× ${name}`, 'success');
  });
}

async function saveCapacity() {
  if (!activePanelId) return;
  const cap = parseInt(document.getElementById('capacity-input').value, 10);
  if (!cap || cap < 1) { showToast('Capacity must be at least 1', 'error'); return; }
  await withLoading('btn-save-capacity', async () => {
    const data = await apiPost('/api/inventory', { containerId: activePanelId, capacity: cap });
    updateContainerInState(data.container);
    renderContainers(); renderStats(); refreshPanelData(activePanelId);
    showToast('Capacity updated to ' + cap, 'success');
  });
}

function updateContainerInState(updated) {
  const idx = containers.findIndex(c => c.id === updated.id);
  if (idx !== -1) containers[idx] = { ...containers[idx], ...updated };
}

// ── RFID ticker ────────────────────────────────────────────
function flashRfid(text, uid) {
  const el    = document.getElementById('rfid-ticker');
  const txt   = document.getElementById('rfid-text');
  const uidEl = document.getElementById('rfid-uid');
  if (!el) return;
  if (txt)   txt.textContent   = text || 'RFID scan received';
  if (uidEl) uidEl.textContent = uid ? uid.toUpperCase() : '';
  el.classList.add('active');
  clearTimeout(el.__timer);
  el.__timer = setTimeout(() => { el.classList.remove('active'); if (txt) txt.textContent = 'Waiting for scan…'; if (uidEl) uidEl.textContent = ''; }, 4000);
}

// ── Helpers ────────────────────────────────────────────────
async function withLoading(btnId, fn) {
  const btn = document.getElementById(btnId);
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '…'; }
  try { await fn(); }
  catch (err) { showToast(err.message || 'Something went wrong', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-dot"></div><span>${escHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 5)     return 'just now';
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
