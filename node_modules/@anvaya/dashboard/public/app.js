/**
 * Anvaya Dashboard — Client-Side Application
 * 
 * Connects to the Orchestrator API (http://localhost:3001)
 * and drives the dashboard UI.
 */

const API_BASE = 'http://localhost:3001';

// ── State ────────────────────────────────────────
let currentView = 'command-center';
let isExecuting = false;

// ── DOM References ───────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const commandInput = $('#command-input');
const executeBtn = $('#execute-btn');
const executionArea = $('#execution-area');
const executionSteps = $('#execution-steps');
const confirmationArea = $('#confirmation-area');
const finalResponse = $('#final-response');
const workflowIdEl = $('#workflow-id');
const statusDot = $('.status-dot');
const statusText = $('.status-text');
const badgeServers = $('#badge-servers');
const badgeTools = $('#badge-tools');

// ── Navigation ───────────────────────────────────
$$('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const view = item.dataset.view;
    if (view === currentView) return;

    $$('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');

    currentView = view;

    // Load data for the view
    if (view === 'tools') loadTools();
    if (view === 'system') loadSystemHealth();
    if (view === 'workflows') loadWorkflowHistory();
  });
});

// ── Command Input ────────────────────────────────
commandInput.addEventListener('input', () => {
  // Auto-resize textarea
  commandInput.style.height = 'auto';
  commandInput.style.height = Math.min(commandInput.scrollHeight, 120) + 'px';
});

commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    executeCommand();
  }
});

executeBtn.addEventListener('click', executeCommand);

// Suggestion buttons
$$('.suggestion').forEach(btn => {
  btn.addEventListener('click', () => {
    commandInput.value = btn.dataset.command;
    commandInput.dispatchEvent(new Event('input'));
    commandInput.focus();
  });
});

// ── Execute Command ──────────────────────────────
async function executeCommand() {
  const message = commandInput.value.trim();
  if (!message || isExecuting) return;

  isExecuting = true;
  executeBtn.disabled = true;
  executeBtn.classList.add('loading');
  executeBtn.innerHTML = '<span>Executing...</span>';

  // Show execution area
  executionArea.classList.remove('hidden');
  executionSteps.innerHTML = '';
  confirmationArea.classList.add('hidden');
  confirmationArea.innerHTML = '';
  finalResponse.classList.add('hidden');
  finalResponse.innerHTML = '';

  // Add initial "planning" step
  addStep('thinking', '🧠', 'Planning', `Analyzing request: "${message}"`, new Date().toISOString());

  try {
    const res = await fetch(`${API_BASE}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Request failed');
    }

    const data = await res.json();
    renderExecutionResult(data);

  } catch (err) {
    addStep('error', '❌', 'Error', err.message, new Date().toISOString());
  } finally {
    isExecuting = false;
    executeBtn.disabled = false;
    executeBtn.classList.remove('loading');
    executeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Execute`;
  }
}

// ── Render Execution Result ──────────────────────
function renderExecutionResult(data) {
  // Set workflow ID
  workflowIdEl.textContent = data.workflowId;

  // Clear planning step and render actual steps
  executionSteps.innerHTML = '';

  for (const step of data.steps) {
    switch (step.type) {
      case 'thinking':
        addStep('thinking', '🧠', 'Agent Thinking', step.text, step.timestamp);
        break;
      case 'tool_call':
        addStep('tool-call', '🔧', `Tool Call: ${formatToolName(step.toolName)}`, 
          `<code>${step.toolName}</code> with ${JSON.stringify(step.toolArgs)}`, step.timestamp);
        break;
      case 'tool_result':
        const resultText = step.result?.content 
          ? step.result.content.map(c => c.text).join('\n')
          : JSON.stringify(step.result, null, 2);
        addStep('tool-result', '✅', `Result: ${formatToolName(step.toolName)}`, resultText, step.timestamp);
        break;
      case 'confirmation_gate':
        addStep('confirmation-gate', '⚠️', 'Confirmation Required', step.confirmationData.summary, step.timestamp);
        break;
      case 'response':
        // Skip — shown in final response area
        break;
    }
  }

  // Render confirmation gates
  if (data.pendingConfirmations && data.pendingConfirmations.length > 0) {
    confirmationArea.classList.remove('hidden');
    confirmationArea.innerHTML = '<h4 style="font-size: 0.85rem; color: var(--warning); margin-bottom: 8px;">⚠️ Actions Awaiting Your Approval</h4>';
    
    for (const gate of data.pendingConfirmations) {
      const card = document.createElement('div');
      card.className = 'confirmation-card';
      card.innerHTML = `
        <div class="confirmation-info">
          <h4>${gate.summary}</h4>
          <p>Action: ${gate.action} via ${formatToolName(gate.toolQualifiedName)}</p>
        </div>
        <div class="confirmation-actions">
          <button class="btn-approve" onclick="confirmAction('${data.workflowId}', '${gate.action}', true)">✓ Approve</button>
          <button class="btn-reject" onclick="confirmAction('${data.workflowId}', '${gate.action}', false)">✕ Reject</button>
        </div>
      `;
      confirmationArea.appendChild(card);
    }
  }

  // Render final response
  if (data.response) {
    finalResponse.classList.remove('hidden');
    finalResponse.innerHTML = `
      <div class="final-response-label">Agent Response</div>
      <div class="final-response-text markdown-body">${window.marked ? marked.parse(data.response) : escapeHtml(data.response)}</div>
    `;
  }
}

// ── Confirm Action ───────────────────────────────
async function confirmAction(workflowId, action, approved) {
  try {
    const res = await fetch(`${API_BASE}/api/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, action, approved }),
    });

    const data = await res.json();

    // Update the confirmation card
    addStep(
      approved ? 'tool-result' : 'error',
      approved ? '✅' : '❌',
      approved ? 'Approved' : 'Rejected',
      data.message,
      new Date().toISOString()
    );
  } catch (err) {
    addStep('error', '❌', 'Confirmation Error', err.message, new Date().toISOString());
  }
}

// ── Add Step to Trace ────────────────────────────
function addStep(type, icon, label, detail, timestamp) {
  const step = document.createElement('div');
  step.className = `step ${type}`;
  
  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : '';
  
  step.innerHTML = `
    <div class="step-icon">${icon}</div>
    <div class="step-content">
      <div class="step-label">${escapeHtml(label)}</div>
      <div class="step-detail">${detail}</div>
    </div>
    <div class="step-timestamp">${time}</div>
  `;
  
  executionSteps.appendChild(step);
  executionSteps.scrollTop = executionSteps.scrollHeight;
}

// ── Load Tools ───────────────────────────────────
async function loadTools() {
  const grid = $('#tools-grid');
  try {
    const res = await fetch(`${API_BASE}/api/tools`);
    const data = await res.json();

    if (data.totalTools === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No tools discovered. Make sure MCP servers are running.</p></div>';
      return;
    }

    grid.innerHTML = '';
    for (const [server, tools] of Object.entries(data.byServer)) {
      for (const tool of tools) {
        const card = document.createElement('div');
        card.className = 'tool-card';
        card.innerHTML = `
          <span class="tool-server-badge ${server}">${server}</span>
          <div class="tool-name">${tool.name}</div>
          <div class="tool-description">${escapeHtml(tool.description)}</div>
        `;
        grid.appendChild(card);
      }
    }
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p>Failed to load tools: ${err.message}</p></div>`;
  }
}

// ── Load System Health ───────────────────────────
async function loadSystemHealth() {
  const container = $('#system-status');
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    const allServers = ['inventory', 'documents', 'logistics', 'market', 'discovery', 'negotiation'];
    
    container.innerHTML = '';
    
    // Orchestrator card
    const orchCard = document.createElement('div');
    orchCard.className = 'system-card';
    orchCard.innerHTML = `
      <div class="system-card-header">
        <h3>🏢 Orchestrator</h3>
        <span class="status-badge online">Online</span>
      </div>
      <div class="system-card-detail">
        Agent Ready: ${data.agentReady ? '✅ Yes' : '⚠️ No (set ANTHROPIC_API_KEY)'}<br/>
        Total Tools: ${data.totalTools}<br/>
        Connected Servers: ${data.connectedServers.length}/${allServers.length}
      </div>
    `;
    container.appendChild(orchCard);

    // Server cards
    for (const server of allServers) {
      const isConnected = data.connectedServers.includes(server);
      const card = document.createElement('div');
      card.className = 'system-card';
      card.innerHTML = `
        <div class="system-card-header">
          <h3>${getServerEmoji(server)} ${capitalize(server)}</h3>
          <span class="status-badge ${isConnected ? 'online' : 'offline'}">${isConnected ? 'Online' : 'Offline'}</span>
        </div>
        <div class="system-card-detail">
          Port: ${getServerPort(server)}<br/>
          Status: ${isConnected ? 'Connected & tools discovered' : 'Not responding'}
        </div>
      `;
      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `
      <div class="system-card">
        <div class="system-card-header">
          <h3>🏢 Orchestrator</h3>
          <span class="status-badge offline">Offline</span>
        </div>
        <div class="system-card-detail">
          Cannot reach orchestrator at ${API_BASE}.<br/>
          Make sure to start it with: <code>npm run dev:orchestrator</code>
        </div>
      </div>
    `;
  }
}

// ── Load Workflow History ─────────────────────────
async function loadWorkflowHistory() {
  const container = $('#workflow-history');
  try {
    const res = await fetch(`${API_BASE}/api/workflows`);
    const data = await res.json();

    if (data.count === 0) {
      container.innerHTML = '<div class="empty-state"><p>No workflows executed yet. Use the Command Center to get started.</p></div>';
      return;
    }

    container.innerHTML = '';
    for (const wf of data.workflows.reverse()) {
      const card = document.createElement('div');
      card.className = 'workflow-card';
      card.innerHTML = `
        <div class="workflow-card-header">
          <span class="workflow-card-id">${wf.workflowId}</span>
          <span class="workflow-card-status ${wf.status}">${formatStatus(wf.status)}</span>
        </div>
        <div class="workflow-card-response markdown-body">${window.marked ? marked.parse(wf.response || '...') : escapeHtml(wf.response?.substring(0, 200) || '...')}</div>
      `;
      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Cannot reach orchestrator. Start it first.</p></div>`;
  }
}

// ── Health Check on Load ─────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    statusDot.classList.add('connected');
    statusText.textContent = `${data.connectedServers.length} servers`;
    badgeServers.textContent = `${data.connectedServers.length} servers`;
    badgeTools.textContent = `${data.totalTools} tools`;
  } catch {
    statusDot.classList.add('error');
    statusText.textContent = 'Orchestrator offline';
    badgeServers.textContent = '0 servers';
    badgeTools.textContent = '0 tools';
  }
}

// ── Helpers ──────────────────────────────────────
function formatToolName(name) {
  if (!name) return '';
  const parts = name.split('__');
  return parts.length > 1 ? `${parts[0]} → ${parts[1]}` : name;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatStatus(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getServerEmoji(name) {
  const emojis = {
    inventory: '📦', documents: '📄', logistics: '🚚',
    market: '📊', discovery: '🔍', negotiation: '🤝'
  };
  return emojis[name] || '🔧';
}

function getServerPort(name) {
  const ports = {
    inventory: 3004, documents: 3007, logistics: 3008,
    market: 3009, discovery: 3010, negotiation: 3011
  };
  return ports[name] || '?';
}

// Make confirmAction globally accessible
window.confirmAction = confirmAction;

// ── Boot ─────────────────────────────────────────
checkHealth();
setInterval(checkHealth, 15000); // Poll health every 15s
