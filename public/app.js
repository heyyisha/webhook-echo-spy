let currentSessionId = null;
let currentSecret = null;
let capturedRequests = [];
let selectedRequestId = null;
let activeTab = 'payload';

async function createSession() {
    const res = await fetch('/api/sessions', { method: 'POST' });
    const data = await res.json();
    currentSessionId = data.sessionId;
    currentSecret = data.secret;

    const fullUrl = `${window.location.origin}/api/hook/${currentSessionId}`;
    document.getElementById('endpoint-url').textContent = fullUrl;
    
    document.getElementById('setup-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('session-controls').classList.remove('hidden');

    initSSE();
}

function copyEndpoint() {
    navigator.clipboard.writeText(document.getElementById('endpoint-url').textContent);
    alert('Endpoint copied!');
}

async function triggerTestWebhook() {
    if (!currentSessionId) return;
    await fetch(`/api/hook/${currentSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bypass-sig': 'true' },
        body: JSON.stringify({ event: "charge.completed", amount: 9999, user: "Isha Agarwal" })
    });
}

function initSSE() {
    const eventSource = new EventSource(`/api/sessions/${currentSessionId}/stream`);
    eventSource.onmessage = (event) => {
        const reqData = JSON.parse(event.data);
        capturedRequests.unshift(reqData);
        renderRequestsList();
        if (!selectedRequestId) selectRequest(reqData.id);
    };
}

function renderRequestsList() {
    const searchTerm = document.getElementById('search-box').value.toLowerCase();
    const filtered = capturedRequests.filter(r => JSON.stringify(r).toLowerCase().includes(searchTerm));
    
    document.getElementById('req-count').textContent = filtered.length;
    const listEl = document.getElementById('requests-list');
    
    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-center py-12 text-slate-500 text-xs">No matching webhook events</div>`;
        return;
    }

    listEl.innerHTML = filtered.map(req => `
        <div onclick="selectRequest('${req.id}')" class="p-3 rounded-xl border cursor-pointer transition ${selectedRequestId === req.id ? 'bg-indigo-950/50 border-indigo-500' : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'}">
            <div class="flex justify-between items-center mb-1">
                <span class="font-mono font-bold text-xs px-2 py-0.5 rounded ${req.method === 'POST' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}">${req.method}</span>
                <span class="text-[10px] text-slate-500">${new Date(req.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>ID: ${req.id}</span>
                <span class="${req.verified ? 'text-emerald-400' : 'text-amber-400'}">${req.verified ? '● Verified' : '○ Unsigned'}</span>
            </div>
        </div>
    `).join('');
}

function selectRequest(id) {
    selectedRequestId = id;
    renderRequestsList();
    document.getElementById('action-buttons').classList.remove('hidden');
    
    const req = capturedRequests.find(r => r.id === id);
    if (!req) return;

    document.getElementById('security-badge').innerHTML = `
        <span class="text-xs font-mono px-2.5 py-1 rounded-lg border ${req.verified ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}">
            ${req.verified ? '🔒 HMAC-SHA256 Signature Validated' : '⚠️ Unverified Signature'}
        </span>
    `;

    renderInspectorContent();
}

function switchTab(tab) {
    activeTab = tab;
    document.getElementById('tab-payload').className = `text-xs font-semibold px-3 py-1 rounded ${tab === 'payload' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`;
    document.getElementById('tab-code').className = `text-xs font-semibold px-3 py-1 rounded ${tab === 'code' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`;
    renderInspectorContent();
}

function renderInspectorContent() {
    const req = capturedRequests.find(r => r.id === selectedRequestId);
    if (!req) return;

    const inspector = document.getElementById('inspector-content');

    if (activeTab === 'payload') {
        inspector.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="text-xs font-bold text-slate-400 uppercase mb-1">Query Parameters</h4>
                    <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">${JSON.stringify(req.query, null, 2)}</pre>
                </div>
                <div>
                    <h4 class="text-xs font-bold text-slate-400 uppercase mb-1">Headers</h4>
                    <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">${JSON.stringify(req.headers, null, 2)}</pre>
                </div>
                <div>
                    <h4 class="text-xs font-bold text-slate-400 uppercase mb-1">JSON Payload</h4>
                    <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto">${JSON.stringify(req.body, null, 2)}</pre>
                </div>
            </div>
        `;
    } else {
        const curlSnippet = `curl -X POST ${window.location.origin}/api/hook/${currentSessionId} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(req.body)}'`;
        const pythonSnippet = `import requests\n\nurl = "${window.location.origin}/api/hook/${currentSessionId}"\npayload = ${JSON.stringify(req.body, null, 4)}\nres = requests.post(url, json=payload)\nprint(res.json())`;
        
        inspector.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="text-xs font-bold text-slate-400 uppercase mb-1">cURL Snippet</h4>
                    <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-indigo-300 overflow-x-auto">${curlSnippet}</pre>
                </div>
                <div>
                    <h4 class="text-xs font-bold text-slate-400 uppercase mb-1">Python (Requests)</h4>
                    <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-amber-300 overflow-x-auto">${pythonSnippet}</pre>
                </div>
            </div>
        `;
    }
}

function openReplayModal() { document.getElementById('replay-modal').classList.remove('hidden'); }
function closeReplayModal() { document.getElementById('replay-modal').classList.add('hidden'); document.getElementById('replay-result').classList.add('hidden'); }

async function executeReplay() {
    const targetUrl = document.getElementById('replay-url').value;
    const resEl = document.getElementById('replay-result');
    resEl.classList.remove('hidden');
    resEl.textContent = 'Dispatching webhook replay...';

    const res = await fetch(`/api/sessions/${currentSessionId}/replay/${selectedRequestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl })
    });
    const data = await res.json();
    resEl.innerHTML = `<strong>Status:</strong> ${data.status} | <strong>Latency:</strong> ${data.latency}ms<br><pre class="mt-2 text-slate-400">${data.responseBody}</pre>`;
}

function filterRequests() { renderRequestsList(); }