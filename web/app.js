'use strict'

// ── Config ──────────────────────────────────────────────────────
const API = window.location.origin

// ── State ───────────────────────────────────────────────────────
let currentSessionId = null
let pollTimer = null
let currentSessionStatus = null

// ── Utilities ───────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel)

function esc(val) {
  return String(val ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isTerminal(status) {
  return ['CONCLUDED', 'STOPPED', 'BLOCKED', 'ERROR'].includes(status)
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

function toast(msg, type = 'info') {
  const el = $('#toast')
  el.textContent = msg
  el.dataset.type = type
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2800)
}

// ── Navigation ──────────────────────────────────────────────────
function show(sectionId) {
  for (const sec of ['sessions', 'create', 'detail']) {
    document.getElementById(`section-${sec}`).hidden = sec !== sectionId
  }
}

// ── Sessions list ────────────────────────────────────────────────
async function loadSessions() {
  try {
    const sessions = await api('/sessions')
    renderSessions(sessions)
  } catch (e) {
    toast(e.message, 'error')
  }
}

function renderSessions(sessions) {
  const el = $('#session-list')
  if (!sessions.length) {
    el.innerHTML = '<div class="empty">No investigations yet.</div>'
    return
  }
  el.innerHTML = sessions.map((s) => `
    <div class="session-card" data-id="${esc(s.id)}">
      <div>
        <div class="session-card-name">${esc(s.name || s.objective)}</div>
        <div class="session-card-objective">${esc(s.objective)}</div>
      </div>
      <div class="session-card-right">
        <span class="badge badge-${esc(s.status)}">${esc(s.status)}</span>
        <span style="font-size:11px;color:var(--muted)">${fmtDate(s.updatedAt || s.createdAt)}</span>
      </div>
    </div>
  `).join('')

  el.querySelectorAll('.session-card').forEach((card) => {
    card.addEventListener('click', () => openSession(card.dataset.id))
  })
}

// ── Create session ───────────────────────────────────────────────
$('#form-create-session').addEventListener('submit', async (e) => {
  e.preventDefault()
  const fd = new FormData(e.currentTarget)
  const data = Object.fromEntries(fd)
  delete data.chatgptUrl
  data.maxIterations = Number(data.maxIterations)
  data.maxRuntimeSeconds = Number(data.maxRuntimeSeconds)
  // strip empty optional fields
  if (!data.name) delete data.name
  if (!data.workspacePath) delete data.workspacePath
  try {
    const session = await api('/sessions', { method: 'POST', body: JSON.stringify(data) })
    toast('Investigation created')
    await openSession(session.id)
  } catch (e) {
    toast(e.message, 'error')
  }
})

// ── Session detail ───────────────────────────────────────────────
async function openSession(id) {
  try {
    currentSessionId = id
    const state = await api(`/sessions/${id}/state`)
    renderDetail(state)
    show('detail')
    if (isTerminal(state.session.status)) {
      stopPolling()
    } else {
      startPolling(id)
    }
  } catch (e) {
    toast(e.message, 'error')
  }
}

function renderDetail(state) {
  const s = state.session
  currentSessionStatus = s.status

  $('#detail-title').textContent = s.name || s.objective
  const badge = $('#status-badge')
  badge.textContent = s.status
  badge.className = `badge badge-${s.status}`

  $('#detail-info').innerHTML = [
    `Agent A: <strong>${esc(s.agentAProvider)}</strong>`,
    `Agent B: <strong>${esc(s.agentBModel)}</strong>`,
    `Workspace: <strong>${esc(s.workspacePath || '—')}</strong>`,
    `Updated: <strong>${fmtDate(s.updatedAt || s.createdAt)}</strong>`,
  ].join('<span style="color:var(--border)"> | </span>')

  $('#btn-run').disabled = !['CREATED', 'STOPPED'].includes(s.status)
  $('#btn-stop').disabled = isTerminal(s.status)

  renderMessages(state.messages)
  renderEvidence(state.evidence)
  renderExperiments(state.experiments)
  renderHypotheses(state.hypotheses)

  // if already on report tab and done, auto-load
  const activeTab = document.querySelector('.tab.active')?.dataset.tab
  if (activeTab === 'report' && isTerminal(s.status)) {
    loadReport(s.id)
  }
}

// ── Run / Stop ───────────────────────────────────────────────────
$('#btn-run').addEventListener('click', async () => {
  try {
    await api(`/sessions/${currentSessionId}/run`, { method: 'POST', body: '{}' })
    toast('Started')
    startPolling(currentSessionId)
    await refreshDetail()
  } catch (e) {
    toast(e.message, 'error')
  }
})

$('#btn-stop').addEventListener('click', async () => {
  try {
    await api(`/sessions/${currentSessionId}/stop`, { method: 'POST' })
    toast('Stopped')
    stopPolling()
    await refreshDetail()
  } catch (e) {
    toast(e.message, 'error')
  }
})

async function refreshDetail() {
  if (!currentSessionId) return
  try {
    const state = await api(`/sessions/${currentSessionId}/state`)
    renderDetail(state)
    if (isTerminal(state.session.status)) stopPolling()
  } catch (e) {
    toast(e.message, 'error')
  }
}

// ── Polling ──────────────────────────────────────────────────────
function startPolling(id) {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!currentSessionId) return
    await refreshDetail()
    await refreshActiveTab()
  }, 3000)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

async function refreshActiveTab() {
  const tab = document.querySelector('.tab.active')?.dataset.tab
  if (!currentSessionId || !tab) return
  try {
    if (tab === 'messages')     renderMessages(await api(`/sessions/${currentSessionId}/messages`))
    if (tab === 'evidence')     renderEvidence(await api(`/sessions/${currentSessionId}/evidence`))
    if (tab === 'experiments')  renderExperiments(await api(`/sessions/${currentSessionId}/experiments`))
    if (tab === 'hypotheses')   renderHypotheses(await api(`/sessions/${currentSessionId}/hypotheses`))
    if (tab === 'report' && isTerminal(currentSessionStatus)) loadReport(currentSessionId)
  } catch (_) { /* silent on poll errors */ }
}

// ── Tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = true })
    btn.classList.add('active')
    const panel = document.getElementById(`tab-${btn.dataset.tab}`)
    if (panel) panel.hidden = false
    await refreshActiveTab()
  })
})

// ── Render: Messages ─────────────────────────────────────────────
function renderMessages(messages) {
  const el = $('#message-log')
  if (!messages.length) {
    el.innerHTML = '<div class="empty">No messages yet.</div>'
    return
  }
  el.innerHTML = messages.map((m) => {
    let payload = {}
    try { payload = JSON.parse(m.payload) } catch (_) { payload = { text: m.payload } }

    if (m.messageType === 'system') {
      return `<div class="msg msg-orchestrator">⟳ ${esc(payload.message || m.payload)}</div>`
    }

    const summary = payload.objective
      || payload.conclusions?.[0]?.statement
      || payload.text
      || 'Agent response'

    const extras = []
    if (payload.evidence?.length)  extras.push(`${payload.evidence.length} evidence`)
    if (payload.experiments?.length) extras.push(`${payload.experiments.length} experiments`)
    if (payload.recommended_next_action) extras.push(`next: ${payload.recommended_next_action}`)

    return `
      <div class="msg msg-${esc(m.sender)}">
        <div class="msg-header">
          <span class="msg-sender">${esc(m.sender)}</span>
          <span class="msg-type">${esc(m.messageType)}</span>
          <span class="msg-time">${fmtDate(m.createdAt)}</span>
        </div>
        <div class="msg-summary">
          <strong>${esc(String(summary).slice(0, 120))}</strong>
          ${extras.length ? `<small>${esc(extras.join(' · '))}</small>` : ''}
        </div>
        <details>
          <summary>payload</summary>
          <pre>${esc(JSON.stringify(payload, null, 2))}</pre>
        </details>
      </div>
    `
  }).join('')
}

// ── Render: Evidence ─────────────────────────────────────────────
function renderEvidence(items) {
  const el = $('#evidence-list')
  if (!items.length) { el.innerHTML = '<div class="empty">No evidence yet.</div>'; return }
  el.innerHTML = '<div class="artifact-list">' + items.map((item) => `
    <div class="artifact-row">
      <span class="artifact-type">${esc(item.type)}</span>
      <div>
        <div class="artifact-desc">${esc(item.description)}</div>
        <div class="artifact-meta">${esc(item.location || '')} · ${esc(item.source)}</div>
      </div>
      <span class="artifact-badge">${Math.round((item.confidence ?? 1) * 100)}%</span>
    </div>
  `).join('') + '</div>'
}

// ── Render: Experiments ──────────────────────────────────────────
function renderExperiments(items) {
  const el = $('#experiment-list')
  if (!items.length) { el.innerHTML = '<div class="empty">No experiments yet.</div>'; return }
  el.innerHTML = '<div class="artifact-list">' + items.map((item) => `
    <div class="artifact-row">
      <span class="artifact-type">${esc(item.status)}</span>
      <div>
        <div class="artifact-desc">${esc(item.objective)}</div>
        <div class="artifact-meta">${esc(item.actualResult || item.expectedResult || '—')}</div>
      </div>
      <span class="artifact-badge">${esc(item.id)}</span>
    </div>
  `).join('') + '</div>'
}

// ── Render: Hypotheses ───────────────────────────────────────────
function renderHypotheses(items) {
  const el = $('#hypothesis-list')
  if (!items.length) { el.innerHTML = '<div class="empty">No hypotheses yet.</div>'; return }
  el.innerHTML = '<div class="artifact-list">' + items.map((item) => `
    <div class="artifact-row">
      <span class="artifact-type">${esc(item.status)}</span>
      <div>
        <div class="artifact-desc">${esc(item.statement)}</div>
        <div class="artifact-meta">${esc(item.proposedBy)}</div>
      </div>
      <span class="artifact-badge">${Math.round((item.confidence ?? 0.5) * 100)}%</span>
    </div>
  `).join('') + '</div>'
}

// ── Render: Report ───────────────────────────────────────────────
async function loadReport(id) {
  try {
    const report = await api(`/sessions/${id}/report`)
    renderReport(report)
  } catch (e) {
    $('#report-content').innerHTML = `<div class="empty">${esc(e.message)}</div>`
  }
}

function renderReport(r) {
  const section = (title, content) =>
    `<h2>${esc(title)}</h2>${content}`

  const list = (items, fallback = 'None.') =>
    items.length
      ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
      : `<p>${fallback}</p>`

  const hypoTable = r.hypotheses.length
    ? `<table>
        <thead><tr><th>ID</th><th>Statement</th><th>Status</th><th>Confidence</th></tr></thead>
        <tbody>${r.hypotheses.map((h) =>
          `<tr><td>${esc(h.id)}</td><td>${esc(h.statement)}</td><td>${esc(h.status)}</td><td>${Math.round(h.confidence * 100)}%</td></tr>`
        ).join('')}</tbody>
      </table>`
    : '<p>None.</p>'

  $('#report-content').innerHTML = [
    section('Summary',          `<p>${esc(r.summary)}</p>`),
    section('Confirmed facts',  list(r.confirmed_facts)),
    section('Conclusions',      list(r.conclusions)),
    section('Hypotheses',       hypoTable),
    section('Remaining unknowns', list(r.remaining_unknowns)),
    section('Next steps',       list(r.recommended_next_steps)),
    section('Session record',   `<p>${r.meta.total_iterations} iterations · ${r.meta.total_messages} messages · ${r.evidence.length} evidence items · ${r.experiments.length} experiments</p>`),
  ].join('')
}

// ── Export ───────────────────────────────────────────────────────
$('#btn-export-md').addEventListener('click', () => {
  fetch(`${API}/sessions/${currentSessionId}/report?format=markdown`)
    .then((r) => r.text())
    .then((t) => download(t, `parallax-${currentSessionId}.md`, 'text/markdown'))
    .catch((e) => toast(e.message, 'error'))
})

$('#btn-export-json').addEventListener('click', () => {
  fetch(`${API}/sessions/${currentSessionId}/report`)
    .then((r) => r.text())
    .then((t) => download(t, `parallax-${currentSessionId}.json`, 'application/json'))
    .catch((e) => toast(e.message, 'error'))
})

function download(text, filename, type) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Navigation buttons ───────────────────────────────────────────
$('#btn-new-session').addEventListener('click', () => show('create'))

function cancelCreate() { show('sessions'); loadSessions() }
$('#btn-cancel-create').addEventListener('click', cancelCreate)
$('#btn-cancel-create-2').addEventListener('click', cancelCreate)

$('#btn-back').addEventListener('click', () => {
  stopPolling()
  currentSessionId = null
  show('sessions')
  loadSessions()
})

// ── Boot ─────────────────────────────────────────────────────────
loadSessions()
