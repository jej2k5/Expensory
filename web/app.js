'use strict';

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt  = v  => fmtCurrency.format(v);
const fmtShort = v => fmtCurrency.format(v).replace(/\.00$/, '');
const fmtMonth = ym => new Date(ym + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const fmtDate  = d  => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const esc = s  => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Date helpers ─────────────────────────────────────────────────────────────
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function prevYM(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`;
}
function nextYM(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`;
}
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2,'0')}` };
}

// ── Category emoji map ───────────────────────────────────────────────────────
function catEmoji(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('food') || n.includes('dining') || n.includes('restaurant')) return '🍽️';
  if (n.includes('transport') || n.includes('car') || n.includes('uber'))     return '🚗';
  if (n.includes('shop'))        return '🛍️';
  if (n.includes('entertainment') || n.includes('fun')) return '🎭';
  if (n.includes('health') || n.includes('medical'))    return '💊';
  if (n.includes('hous') || n.includes('util') || n.includes('rent')) return '🏠';
  if (n.includes('travel'))   return '✈️';
  if (n.includes('education') || n.includes('school')) return '📚';
  return '💰';
}

// ── API layer ────────────────────────────────────────────────────────────────
const api = {
  async _get(path) {
    const r = await fetch(path);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  },
  async _post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  },
  async _del(path) {
    const r = await fetch(path, { method: 'DELETE' });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  },

  categories:    ()         => api._get('/categories'),
  budgets:       month      => api._get(`/budgets?month=${month}`),
  expenses:      params     => api._get(`/expenses?${new URLSearchParams(params)}`),
  expenseSummary:(ym)       => { const r = monthRange(ym); return api._get(`/expenses/summary?group_by=category&start_date=${r.start}&end_date=${r.end}`); },
  deleteExpense: id         => api._del(`/expenses/${id}`),
  createExpense: body       => api._post('/expenses', body),
  uploadReceipt: async(file) => {
    const data = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    return api._post('/receipts', { data, mimetype: file.type, filename: file.name });
  },
};

// ── State ────────────────────────────────────────────────────────────────────
const S = {
  tab:      'home',
  month:    currentYM(),
  cats:     null,   // array of categories (cached)
  listCat:  null,   // category_id filter on list tab
  receipt:  null,   // { file, previewUrl, uploaded: bool, filename, url }
  selCatId: null,   // selected category id in add form
};

// ── Toasts ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').prepend(el);
  setTimeout(() => el.remove(), 3400);
}

// ── Month navigation ─────────────────────────────────────────────────────────
function updateHeaderMonth() {
  document.getElementById('header-month').textContent = fmtMonth(S.month);
}

document.getElementById('month-prev').addEventListener('click', () => {
  S.month = prevYM(S.month);
  updateHeaderMonth();
  refreshTab();
});

document.getElementById('month-next').addEventListener('click', () => {
  if (S.month >= currentYM()) return;
  S.month = nextYM(S.month);
  updateHeaderMonth();
  refreshTab();
});

// ── Tab routing ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tab}`));
  S.tab = tab;
  renderTab(tab);
}

function refreshTab() { renderTab(S.tab); }

function renderTab(tab) {
  switch (tab) {
    case 'home':   renderHome();   break;
    case 'add':    renderAdd();    break;
    case 'list':   renderList();   break;
    case 'budget': renderBudget(); break;
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Categories (cached) ──────────────────────────────────────────────────────
async function getCats() {
  if (!S.cats) S.cats = await api.categories();
  return S.cats;
}

// ── HOME TAB ──────────────────────────────────────────────────────────────────
async function renderHome() {
  const el = document.getElementById('home-content');
  el.innerHTML = '<div class="spinner">Loading…</div>';
  try {
    const r          = monthRange(S.month);
    const [sumRes, expRes] = await Promise.all([
      api.expenseSummary(S.month),
      api.expenses({ start_date: r.start, end_date: r.end, limit: 5 }),
    ]);

    const breakdown = sumRes.breakdown || [];
    const total     = Number(sumRes.summary?.total || 0);
    const count     = Number(sumRes.summary?.count || 0);
    const recent    = expRes.expenses || [];
    const avgVal    = count > 0 ? total / count : 0;

    el.innerHTML = `
      <div class="hero">
        <div class="hero-label">Total · ${fmtMonth(S.month)}</div>
        <div class="hero-amount">${fmt(total)}</div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-val">${count}</div>
            <div class="hero-stat-label">Expenses</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val">${breakdown.length}</div>
            <div class="hero-stat-label">Categories</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val">${count > 0 ? fmtShort(avgVal) : '—'}</div>
            <div class="hero-stat-label">Average</div>
          </div>
        </div>
      </div>

      ${breakdown.length ? `
        <div class="card">
          <div class="card-label">By Category</div>
          ${breakdown.map(c => {
            const pct = total > 0 ? (Number(c.total) / total * 100) : 0;
            const color = c.category_color || '#9ca3af';
            return `
              <div class="cat-row">
                <span class="cat-dot" style="background:${esc(color)}"></span>
                <div class="cat-row-body">
                  <div class="cat-row-top">
                    <span class="cat-row-name">${esc(c.category_name || 'Uncategorised')}</span>
                    <span class="cat-row-amount">${fmt(c.total)}</span>
                  </div>
                  <div class="cat-bar-track">
                    <div class="cat-bar-fill" style="width:${pct.toFixed(1)}%;background:${esc(color)}"></div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>` : ''}

      ${recent.length ? `
        <div class="card">
          <div class="section-hd">
            <div class="section-title">Recent</div>
            <div class="section-link" data-goto="list">See all</div>
          </div>
          ${recent.map(e => expenseRow(e)).join('')}
        </div>` : `
        <div class="empty">
          <div class="empty-icon">📊</div>
          <div class="empty-title">No expenses yet</div>
          <div class="empty-sub">Tap <strong>Add</strong> to record your first expense</div>
        </div>`}
    `;

    el.querySelector('[data-goto="list"]')?.addEventListener('click', () => switchTab('list'));
    el.querySelectorAll('.expense-item').forEach(row => {
      row.addEventListener('click', () => openExpenseModal(row.dataset.id));
    });
  } catch(err) {
    el.innerHTML = errorState(err.message);
  }
}

// ── ADD TAB ───────────────────────────────────────────────────────────────────
async function renderAdd() {
  const el = document.getElementById('add-content');
  const cats = await getCats().catch(() => []);

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">Receipt</div>
      ${S.receipt ? receiptPreviewHtml() : `
        <div class="receipt-zone" id="receipt-zone">
          <div class="receipt-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <div class="receipt-zone-title">Take photo or upload file</div>
          <div class="receipt-zone-sub">JPEG · PNG · PDF · up to 15 MB</div>
        </div>`}
    </div>

    <div class="card">
      <div class="form-group">
        <label class="form-label">Amount *</label>
        <div class="amount-wrap">
          <span class="amount-prefix">$</span>
          <input id="f-amount" class="amount-input" type="number" inputmode="decimal"
                 placeholder="0.00" step="0.01" min="0.01">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Merchant / Title *</label>
        <input id="f-title" class="form-input" type="text" placeholder="e.g. Starbucks, Amazon…" autocomplete="off">
      </div>

      <div class="form-group">
        <label class="form-label">Category</label>
        <div class="cat-pills" id="cat-pills">
          <div class="cat-pill ${!S.selCatId ? 'selected' : ''}" data-cat-id="">
            <span class="cat-dot" style="background:#9ca3af"></span>None
          </div>
          ${cats.map(c => `
            <div class="cat-pill ${S.selCatId == c.id ? 'selected' : ''}" data-cat-id="${c.id}">
              <span class="cat-dot" style="background:${esc(c.color)}"></span>${esc(c.name)}
            </div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Date</label>
        <input id="f-date" class="form-input" type="date" value="${todayYMD()}">
      </div>

      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Notes (optional)</label>
        <textarea id="f-notes" class="form-textarea" placeholder="Any extra details…"></textarea>
      </div>
    </div>

    <button id="save-btn" class="btn btn-primary">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Save Expense
    </button>
  `;

  // Receipt zone tap
  el.querySelector('#receipt-zone')?.addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  // Remove receipt
  el.querySelector('#remove-receipt')?.addEventListener('click', () => {
    if (S.receipt?.previewUrl) URL.revokeObjectURL(S.receipt.previewUrl);
    S.receipt = null;
    renderAdd();
  });

  // Category pills
  el.querySelectorAll('.cat-pill').forEach(p => {
    p.addEventListener('click', () => {
      S.selCatId = p.dataset.catId || null;
      el.querySelectorAll('.cat-pill').forEach(x => x.classList.toggle('selected', x === p));
    });
  });

  // Save
  document.getElementById('save-btn').addEventListener('click', saveExpense);
}

function receiptPreviewHtml() {
  const r = S.receipt;
  if (r.previewUrl) {
    return `
      <div class="receipt-preview-wrap">
        <img src="${esc(r.previewUrl)}" alt="Receipt preview">
        <button id="remove-receipt" class="remove-btn" aria-label="Remove receipt">×</button>
      </div>`;
  }
  return `
    <div class="receipt-preview-wrap">
      <div class="pdf-badge">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        ${esc(r.file.name)}
      </div>
      <button id="remove-receipt" class="remove-btn" aria-label="Remove receipt">×</button>
    </div>`;
}

// File input handler (lives outside any re-rendered container)
document.getElementById('file-input').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';
  S.receipt = {
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    uploaded: false,
    filename: null,
    url: null,
  };
  if (S.tab === 'add') renderAdd();
});

async function saveExpense() {
  const amount = parseFloat(document.getElementById('f-amount')?.value);
  const title  = document.getElementById('f-title')?.value?.trim();
  const date   = document.getElementById('f-date')?.value;
  const notes  = document.getElementById('f-notes')?.value?.trim();

  if (!title)           { toast('Please enter a title', 'err');              return; }
  if (!amount || amount <= 0) { toast('Please enter a valid amount', 'err'); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    let receipt_url = null;

    if (S.receipt?.file && !S.receipt.uploaded) {
      btn.textContent = 'Uploading receipt…';
      const res = await api.uploadReceipt(S.receipt.file);
      receipt_url = `/receipts/${res.filename}`;
      S.receipt.uploaded = true;
      S.receipt.filename = res.filename;
      S.receipt.url = receipt_url;
    } else if (S.receipt?.url) {
      receipt_url = S.receipt.url;
    }

    btn.textContent = 'Saving…';
    await api.createExpense({
      title,
      amount,
      category_id: S.selCatId ? Number(S.selCatId) : null,
      date: date || todayYMD(),
      description: notes || '',
      receipt_url,
    });

    toast('Expense saved!');

    // Reset form state
    if (S.receipt?.previewUrl) URL.revokeObjectURL(S.receipt.previewUrl);
    S.receipt   = null;
    S.selCatId  = null;
    S.cats      = null;   // invalidate category cache (totals changed)

    renderAdd();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Expense';
  }
}

// ── LIST TAB ──────────────────────────────────────────────────────────────────
async function renderList() {
  const el = document.getElementById('list-content');
  el.innerHTML = '<div class="spinner">Loading…</div>';
  try {
    const cats = await getCats().catch(() => []);
    const r    = monthRange(S.month);
    const params = { start_date: r.start, end_date: r.end, limit: 150 };
    if (S.listCat) params.category_id = S.listCat;

    const res      = await api.expenses(params);
    const expenses = res.expenses || [];

    const allChips = [{ id: null, name: 'All', color: '#9ca3af' }, ...cats];

    el.innerHTML = `
      <div class="filter-chips" id="filter-chips">
        ${allChips.map(c => `
          <div class="chip ${S.listCat == c.id ? 'active' : ''}" data-cat-id="${c.id ?? ''}">
            <span class="chip-dot" style="background:${esc(c.color)}"></span>${esc(c.name)}
          </div>`).join('')}
      </div>
      <div class="card">
        ${expenses.length
          ? expenses.map(e => expenseRow(e)).join('')
          : `<div class="empty" style="padding:28px 0">
               <div class="empty-icon">🧾</div>
               <div class="empty-title">No expenses</div>
               <div class="empty-sub">Nothing recorded for ${fmtMonth(S.month)}</div>
             </div>`}
      </div>
    `;

    el.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        S.listCat = chip.dataset.catId ? Number(chip.dataset.catId) : null;
        renderList();
      });
    });
    el.querySelectorAll('.expense-item').forEach(row => {
      row.addEventListener('click', () => openExpenseModal(row.dataset.id));
    });
  } catch (err) {
    el.innerHTML = errorState(err.message);
  }
}

// ── BUDGET TAB ────────────────────────────────────────────────────────────────
async function renderBudget() {
  const el = document.getElementById('budget-content');
  el.innerHTML = '<div class="spinner">Loading…</div>';
  try {
    const res     = await api.budgets(S.month);
    const budgets = res.budgets || [];

    const withBudget = budgets.filter(b => b.budget_limit != null);
    const noBudget   = budgets.filter(b => b.budget_limit == null && Number(b.spent) > 0);

    el.innerHTML = `
      ${withBudget.length ? `
        <div class="card">
          <div class="card-label">Budgets · ${fmtMonth(S.month)}</div>
          ${withBudget.map(b => {
            const pct  = Math.min((Number(b.spent) / Number(b.budget_limit)) * 100, 100);
            const over = b.over_budget;
            const barColor = over ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : 'var(--success)';
            return `
              <div class="budget-item">
                <div class="budget-item-hd">
                  <div class="budget-cat">
                    <span class="cat-dot" style="background:${esc(b.category_color || '#9ca3af')}"></span>
                    ${esc(b.category_name)}
                  </div>
                  <div class="budget-amounts">
                    <strong>${fmtShort(b.spent)}</strong> / ${fmtShort(b.budget_limit)}
                  </div>
                </div>
                <div class="budget-track">
                  <div class="budget-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
                </div>
                <div class="budget-pct ${over ? 'over' : ''}">
                  ${over
                    ? `⚠ ${fmtShort(Number(b.spent) - Number(b.budget_limit))} over budget`
                    : `${Math.round(pct)}% used · ${fmtShort(b.remaining)} left`}
                </div>
              </div>`;
          }).join('')}
        </div>` : ''}

      ${noBudget.length ? `
        <div class="card">
          <div class="card-label">No Budget Set</div>
          ${noBudget.map(b => `
            <div class="cat-row">
              <span class="cat-dot" style="background:${esc(b.category_color || '#9ca3af')}"></span>
              <div class="cat-row-body">
                <div class="cat-row-top">
                  <span class="cat-row-name">${esc(b.category_name)}</span>
                  <span class="cat-row-amount">${fmt(b.spent)}</span>
                </div>
              </div>
            </div>`).join('')}
        </div>` : ''}

      ${budgets.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">📊</div>
          <div class="empty-title">No data yet</div>
          <div class="empty-sub">Add some expenses to see your spending here</div>
        </div>` : ''}

      ${withBudget.length === 0 && budgets.length > 0 ? `
        <p style="text-align:center;font-size:13px;color:var(--text-muted);margin-top:8px">
          Set budgets via the CLI client or MCP tools to see progress bars here.
        </p>` : ''}
    `;
  } catch (err) {
    el.innerHTML = errorState(err.message);
  }
}

// ── EXPENSE ROW ───────────────────────────────────────────────────────────────
function expenseRow(e) {
  const color = e.category_color || '#9ca3af';
  const emoji = catEmoji(e.category_name);
  return `
    <div class="expense-item" data-id="${esc(e.id)}">
      <div class="expense-icon" style="background:${esc(color)}22">
        <span>${emoji}</span>
      </div>
      <div class="expense-info">
        <div class="expense-title">${esc(e.title)}</div>
        <div class="expense-meta">${esc(e.category_name || 'Uncategorised')} · ${fmtDate(e.date)}</div>
      </div>
      <div class="expense-amount">${fmt(e.amount)}</div>
    </div>`;
}

// ── EXPENSE DETAIL MODAL ─────────────────────────────────────────────────────
async function openExpenseModal(id) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = '<div class="spinner" style="padding:32px">Loading…</div>';
  overlay.classList.remove('hidden');

  try {
    const r = await fetch(`/expenses/${id}`);
    if (!r.ok) throw new Error('Failed to load expense');
    const e = await r.json();
    const color = e.category_color || '#9ca3af';

    content.innerHTML = `
      <div class="modal-drag"></div>
      <div class="modal-title">${esc(e.title)}</div>
      <div class="modal-meta">${esc(e.category_name || 'Uncategorised')} · ${fmtDate(e.date)}</div>
      <div class="modal-amount" style="color:var(--accent)">${fmt(e.amount)}</div>

      <div class="modal-detail-row">
        <span class="modal-detail-key">Category</span>
        <span class="modal-detail-val" style="display:flex;align-items:center;gap:7px">
          <span class="cat-dot" style="background:${esc(color)}"></span>${esc(e.category_name || '—')}
        </span>
      </div>
      <div class="modal-detail-row">
        <span class="modal-detail-key">Date</span>
        <span class="modal-detail-val">${fmtDate(e.date)}</span>
      </div>
      ${e.description ? `
      <div class="modal-detail-row">
        <span class="modal-detail-key">Notes</span>
        <span class="modal-detail-val">${esc(e.description)}</span>
      </div>` : ''}

      ${e.receipt_url ? `
        <div class="receipt-thumb">
          ${e.receipt_url.match(/\.pdf$/i)
            ? `<div class="pdf-badge" style="height:56px">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                   <polyline points="14 2 14 8 20 8"/>
                 </svg>
                 <a href="${esc(e.receipt_url)}" target="_blank" style="color:var(--danger)">View PDF</a>
               </div>`
            : `<img src="${esc(e.receipt_url)}" alt="Receipt" loading="lazy">`}
        </div>` : ''}

      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-close">Close</button>
        <button class="btn btn-danger" id="modal-delete">Delete</button>
      </div>
    `;

    document.getElementById('modal-close').addEventListener('click',  closeModal);
    document.getElementById('modal-delete').addEventListener('click', async () => {
      if (!confirm('Delete this expense?')) return;
      try {
        await api.deleteExpense(id);
        toast('Expense deleted');
        closeModal();
        S.cats = null;
        refreshTab();
      } catch(err) { toast(err.message, 'err'); }
    });
  } catch (err) {
    content.innerHTML = `
      <div class="modal-drag"></div>
      <div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">${esc(err.message)}</div></div>
      <button class="btn btn-ghost" id="modal-close">Close</button>`;
    document.getElementById('modal-close').addEventListener('click', closeModal);
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ── Shared helpers ────────────────────────────────────────────────────────────
function errorState(msg) {
  return `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load</div><div class="empty-sub">${esc(msg)}</div></div>`;
}

// ── Init ─────────────────────────────────────────────────────────────────────
updateHeaderMonth();
switchTab('home');
