// script.js — RFID Inventory Management Frontend
'use strict';

let containers    = [];
let activePanelId = null;
let pollTimer     = null;
const POLL_MS     = 15000;

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

function initClock() {
  const el = document.getElementById('topbar-clock');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };
  tick(); setInterval(tick, 1000);
}

function initSidebar() {
  document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function startPoll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => loadInventory(true), POLL_MS);
}

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
    if (!silent) setLastSync();
  } catch (err) {
    setStatus('offline');
    if (!silent) showToast('Failed to load inventory: ' + err.message, 'error');
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

function renderStats() {
  const empty    = containers.filter(c => c.status === 'EMPTY').length;
  const lowStock = containers.filter(c => c.status === 'LOW STOCK').length;
  const totalQty = containers.reduce((s, c) => s + c.quantity, 0);
  setText('stat-total', containers.length);
  setText('stat-qty',   totalQty);
  setText('stat-low',   lowStock);
  setText('stat-empty', empty);
  const badge = document.getElementById('sidebar-alert-badge');
  if (badge) {
    const n = lowStock + empty;
    badge.textContent = n;
    badge.className   = 'sidebar-badge' + (n > 0 ? ' alert' : '');
  }
}

function renderContainers() {
  const grid = document.getElementById('container-grid');
  if (!grid) return;
  grid.innerHTML = containers.map((c, i) => {
    const pct      = c.capacity > 0 ? Math.round((c.quantity / c.capacity) * 100) : 0;
    const barClass = c.status === 'FULL' ? 'full' : c.status === 'LOW STOCK' ? 'low' : c.status === 'EMPTY' ? 'empty' : '';
    return `
    <div class="container-card" data-id="${c.id}" tabindex="0" role="button"
         aria-label="Open ${c.name} details" style="animation-delay:${i * 0.05}s">
      <div class="card-header">
        <div>
          <div class="card-name">${escHtml(c.name)}</div>
          <div class="card-id">${c.id.toUpperCase()}</div>
        </div>
        <span class="status-badge ${c.status}">${c.status}</span>
      </div>
      <div class="card-progress-wrap">
        <div class="card-progress-label">
          <span>${pct}% filled</span>
          <span>${c.quantity}/${c.capacity}</span>
        </div>
        <div class="card-progress-track">
          <div class="card-progress-bar ${barClass}" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="card-footer">
        <div>
          <div class="card-qty">${c.quantity}</div>
          <div class="card-cap">cap. ${c.capacity}</div>
        </div>
        <div class="card-log-count">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
            <path d="M2 4h12M2 8h8M2 12h10"/>
          </svg>
          ${(c.logs || []).length} logs
        </div>
      </div>
    </div>`;
  }).join('');

  grid.onclick = e => {
    const card = e.target.closest('.container-card');
    if (card) openPanel(card.dataset.id);
  };
  grid.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.container-card');
      if (card) { e.preventDefault(); openPanel(card.dataset.id); }
    }
  };
}

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
  list.innerHTML = logs.map(l => `
    <div class="activity-entry">
      <div class="act-type">
        <span class="log-type ${l.source === 'rfid' ? 'RFID' : l.type}">${l.source === 'rfid' ? 'RFID' : l.type}</span>
      </div>
      <div class="act-meta">
        <strong>${escHtml(l.containerName || l.containerId)}</strong>
        &nbsp;·&nbsp;${escHtml(l.productName || 'Item')}
        &nbsp;×${l.quantity}
        &nbsp;→ <strong>${l.newTotal}</strong> units
      </div>
      <div class="act-time">${timeAgo(l.timestamp)}</div>
    </div>`).join('');
}

function initPanelClose() {
  document.getElementById('btn-close-panel').onclick  = closePanel;
  document.getElementById('panel-overlay').onclick    = closePanel;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && activePanelId) closePanel(); });
  document.getElementById('btn-save-capacity').onclick = saveCapacity;
  document.getElementById('btn-panel-add').onclick     = panelAdd;
  document.getElementById('btn-panel-remove').onclick  = panelRemove;
}

function openPanel(id) {
  activePanelId = id;
  document.getElementById('panel-overlay').classList.add('open');
  document.getElementById('detail-panel').classList.add('open');
  renderPanel(id);
  document.body.style.overflow = 'hidden';
  loadInventory(true);
}

function closePanel() {
  activePanelId = null;
  document.getElementById('panel-overlay').classList.remove('open');
  document.getElementById('detail-panel').classList.remove('open');
  document.body.style.overflow = '';
}

function refreshPanelData(id) {
  const c = containers.find(c => c.id === id);
  if (!c) return;
  document.getElementById('panel-stat-qty').textContent = c.quantity;
  document.getElementById('panel-stat-cap').textContent = c.capacity;
  const pct = c.capacity > 0 ? Math.round((c.quantity / c.capacity) * 100) : 0;
  document.getElementById('panel-stat-pct').textContent = pct + '%';
  const badge = document.getElementById('panel-status-badge');
  if (badge) { badge.textContent = c.status; badge.className = 'status-badge ' + c.status; }
  // ✅ disable remove when empty
  const removeBtn = document.getElementById('btn-panel-remove');
  if (removeBtn) removeBtn.disabled = c.quantity <= 0;
  renderPanelLogs(c.logs);
}

function renderPanel(id) {
  const c = containers.find(c => c.id === id);
  if (!c) return;
  document.getElementById('panel-title').textContent    = c.name;
  document.getElementById('panel-subtitle').textContent = `ID: ${c.id.toUpperCase()} · ${(c.logs || []).length} log entries`;
  document.getElementById('panel-stat-qty').textContent = c.quantity;
  document.getElementById('panel-stat-cap').textContent = c.capacity;
  const pct = c.capacity > 0 ? Math.round((c.quantity / c.capacity) * 100) : 0;
  document.getElementById('panel-stat-pct').textContent = pct + '%';
  const badge = document.getElementById('panel-status-badge');
  if (badge) { badge.textContent = c.status; badge.className = 'status-badge ' + c.status; }
  document.getElementById('capacity-input').value = c.capacity;
  // ✅ disable remove when empty
  const removeBtn = document.getElementById('btn-panel-remove');
  if (removeBtn) removeBtn.disabled = c.quantity <= 0;
  renderPanelLogs(c.logs);
}

function renderPanelLogs(logs) {
  const list = document.getElementById('panel-log-list');
  if (!list) return;
  if (!logs || !logs.length) {
    list.innerHTML = '<div class="log-empty">No activity yet for this container.</div>';
    return;
  }
  list.innerHTML = [...logs].reverse().slice(0, 60).map(l => `
    <div class="log-entry">
      <span class="log-type ${l.source === 'rfid' ? 'RFID' : l.type}">${l.source === 'rfid' ? 'RFID' : l.type}</span>
      <div class="log-detail">
        ${escHtml(l.productName || 'Item')} ×${l.quantity} → total: ${l.newTotal}
        ${l.uid ? `<span style="color:var(--text3)"> [${l.uid}]</span>` : ''}
      </div>
      <div class="log-time">${timeAgo(l.timestamp)}</div>
    </div>`).join('');
}

async function panelAdd() {
  if (!activePanelId) return;
  const name = document.getElementById('product-name-input').value.trim() || 'Item';
  const qty  = parseInt(document.getElementById('qty-input').value, 10) || 1;
  await withLoading('btn-panel-add', async () => {
    const data = await apiPost('/api/add-product', { containerId: activePanelId, productName: name, quantity: qty });
    updateContainerInState(data.container);
    renderContainers();
    renderStats();
    renderPanel(activePanelId);
    renderActivityFromContainers(containers);
    showToast(`Added ${qty}× ${name} to ${data.container.name}`, 'success');
    flashRfid(`+${qty} ${name}`, null);
  });
}

async function panelRemove() {
  if (!activePanelId) return;

  // ✅ always fetch fresh state before removing
  await loadInventory(true);

  const c = containers.find(c => c.id === activePanelId);
  if (!c || c.quantity <= 0) {
    showToast('Container is already empty', 'error');
    return;
  }

  const name = document.getElementById('product-name-input').value.trim() || 'Item';
  const qty  = parseInt(document.getElementById('qty-input').value, 10) || 1;
  await withLoading('btn-panel-remove', async () => {
    const data = await apiPost('/api/remove-product', { containerId: activePanelId, productName: name, quantity: qty });
    updateContainerInState(data.container);
    renderContainers();
    renderStats();
    renderPanel(activePanelId);
    renderActivityFromContainers(containers);
    showToast(`Removed ${qty}× ${name} from ${data.container.name}`, 'success');
  });
}

async function saveCapacity() {
  if (!activePanelId) return;
  const cap = parseInt(document.getElementById('capacity-input').value, 10);
  if (!cap || cap < 1) { showToast('Capacity must be at least 1', 'error'); return; }
  await withLoading('btn-save-capacity', async () => {
    const data = await apiPost('/api/inventory', { containerId: activePanelId, capacity: cap });
    updateContainerInState(data.container);
    renderContainers();
    renderStats();
    refreshPanelData(activePanelId);
    showToast('Capacity updated to ' + cap, 'success');
  });
}

function updateContainerInState(updated) {
  const idx = containers.findIndex(c => c.id === updated.id);
  if (idx !== -1) containers[idx] = { ...containers[idx], ...updated };
}

function flashRfid(text, uid) {
  const el     = document.getElementById('rfid-live');
  const txt    = document.getElementById('rfid-text');
  const uid_el = document.getElementById('rfid-uid');
  if (!el) return;
  if (txt)    txt.textContent    = text || 'RFID scan received';
  if (uid_el) uid_el.textContent = uid ? uid.toUpperCase() : '';
  el.classList.add('active');
  clearTimeout(el.__timer);
  el.__timer = setTimeout(() => el.classList.remove('active'), 4000);
}

async function withLoading(btnId, fn) {
  const btn  = document.getElementById(btnId);
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  try {
    await fn();
  } catch (err) {
    showToast(err.message || 'Something went wrong', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-dot"></div><span>${escHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 5)     return 'just now';
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
