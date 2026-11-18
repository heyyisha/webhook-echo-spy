let currentSessionId = null;
let capturedRequests = [];
let selectedRequestId = null;

async function createSession() {
    const res = await fetch('/api/sessions', { method: 'POST' });
    const data = await res.json();
    currentSessionId = data.sessionId;

    const fullUrl = `${window.location.origin}/api/hook/${currentSessionId}`;
    document.getElementById('endpoint-url').textContent = fullUrl;
    
    document.getElementById('setup-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('session-controls').classList.remove('hidden');

    initSSE();
}

function copyEndpoint() {
    const url = document.getElementById('endpoint-url').textContent;
    navigator.clipboard.writeText(url);
    alert('Endpoint URL copied to clipboard!');
}

function initSSE() {
    const eventSource = new EventSource(`/api/sessions/${currentSessionId}/stream`);
    
    eventSource.onmessage = (event) => {
        const reqData = JSON.parse(event.data);
        capturedRequests.unshift(reqData);
        renderRequestsList();
        if (!selectedRequestId) {
            selectRequest(reqData.id);
        }
    };
}

function renderRequestsList() {
    document.getElementById('req-count').textContent = capturedRequests.length;
    const listEl = document.getElementById('requests-list');
    
    listEl.innerHTML = capturedRequests.map(req => `
        <div onclick="selectRequest('${req.id}')" class="p-3 rounded-lg border cursor-pointer transition ${selectedRequestId === req.id ? 'bg-indigo-950/40 border-indigo-500' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}">
            <div class="flex justify-between items-center mb-1">
                <span class="font-mono font-bold text-xs px-2 py-0.5 rounded ${req.method === 'POST' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}">${req.method}</span>
                <span class="text-xs text-slate-500">${new Date(req.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="text-xs text-slate-400 truncate">ID: ${req.id}</div>
        </div>
    `).join('');
}

function selectRequest(id) {
    selectedRequestId = id;
    renderRequestsList();
    
    const req = capturedRequests.find(r => r.id === id);
    if (!req) return;

    const inspector = document.getElementById('inspector-content');
    inspector.innerHTML = `
        <div class="space-y-4">
            <div class="flex justify-between items-center bg-slate-950 p-3 rounded border border-slate-800">
                <div><span class="text-slate-500 text-xs">Method:</span> <strong class="text-indigo-400">${req.method}</strong></div>
                <div><span class="text-slate-500 text-xs">Time:</span> ${req.timestamp}</div>
            </div>
            <div>
                <h4 class="text-xs font-bold text-slate-400 uppercase mb-2">Query Parameters</h4>
                <pre class="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">${JSON.stringify(req.query, null, 2)}</pre>
            </div>
            <div>
                <h4 class="text-xs font-bold text-slate-400 uppercase mb-2">Headers</h4>
                <pre class="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">${JSON.stringify(req.headers, null, 2)}</pre>
            </div>
            <div>
                <h4 class="text-xs font-bold text-slate-400 uppercase mb-2">JSON Body</h4>
                <pre class="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto">${JSON.stringify(req.body, null, 2)}</pre>
            </div>
        </div>
    `;
}

function clearRequests() {
    capturedRequests = [];
    selectedRequestId = null;
    renderRequestsList();
    document.getElementById('inspector-content').innerHTML = `<div class="flex items-center justify-center h-full text-slate-500">Select a captured request to inspect headers and body</div>`;
}