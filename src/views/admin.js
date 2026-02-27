let ws = null;
const API_URL = window.location.origin;
let currentInspectMatchId = null;

// ==================== LOGIN ====================
async function login() {
    const password = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch(`${API_URL}/api/admin/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok) {
            sessionStorage.setItem('adminToken', data.token);
            document.getElementById('loginOverlay').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            connectWebSocket();
        } else {
            errorDiv.textContent = data.error || 'Contraseña incorrecta';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Error de conexión';
        errorDiv.classList.remove('hidden');
    }
}

// ==================== WEBSOCKET ====================
function connectWebSocket() {
    const token = sessionStorage.getItem('adminToken');
    if (!token) return;

    const wsUrl = `ws://${window.location.host}/ws?admin_token=${token}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ WebSocket conectado');
        updateStatus(true);
        // Solicitar stats iniciales
        sendEvent('get_admin_stats');
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };

    ws.onclose = () => {
        console.log('❌ WebSocket desconectado');
        updateStatus(false);
        // Reconectar después de 3 segundos
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function sendEvent(event, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data }));
    }
}

function handleMessage(message) {
    const { event, data } = message;

    if (event === 'admin_stats') {
        updateDashboard(data);
    }
}

// ==================== UI UPDATES ====================
function updateStatus(connected) {
    const statusDot = document.getElementById('wsStatus');
    const statusText = document.getElementById('wsStatusText');

    if (connected) {
        statusDot.classList.remove('disconnected');
        statusText.textContent = 'Conectado';
    } else {
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Desconectado';
    }
}

function updateDashboard(data) {
    // Actualizar timestamp
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();

    // Usuarios conectados
    document.getElementById('connectedCount').textContent = data.connectedUsers?.length || 0;
    updateUserList('userList', data.connectedUsers || []);

    // Usuarios buscando
    document.getElementById('searchingCount').textContent = data.searchingUsers?.length || 0;
    updateUserList('searchingList', data.searchingUsers || [], true);

    // Partidas activas
    document.getElementById('matchesCount').textContent = data.activeMatches?.length || 0;
    updateMatchList(data.activeMatches || []);
}

function updateUserList(elementId, users, searching = false) {
    const list = document.getElementById(elementId);
    
    if (users.length === 0) {
        list.innerHTML = '<div class="empty-state">No hay usuarios</div>';
        return;
    }

    list.innerHTML = users.map(user => `
        <li class="user-item ${searching ? 'searching' : ''}">
            <div class="user-info-wrapper">
                <div>
                    <div class="user-name">
                        ${user.username}
                        ${searching ? '<span class="badge searching">Buscando</span>' : ''}
                    </div>
                    <div class="user-id">${user.id}</div>
                </div>
                <div class="user-actions">
                    <button class="btn-disconnect" data-action="disconnect" data-user-id="${user.id}" data-username="${user.username}" title="Desconectar">
                        🔌
                    </button>
                    <button class="btn-block" data-action="block" data-user-id="${user.id}" data-username="${user.username}" title="Bloquear">
                        🚫
                    </button>
                </div>
            </div>
        </li>
    `).join('');
}

function updateMatchList(matches) {
    const list = document.getElementById('matchList');
    
    if (matches.length === 0) {
        list.innerHTML = '<div class="empty-state">No hay partidas activas</div>';
        return;
    }

    list.innerHTML = matches.map(match => {
        const isWaiting = match.phase === 'waiting';
        const badge = isWaiting ? 'waiting' : 'active';
        const badgeText = isWaiting ? 'Esperando' : match.phase;
        
        const player1Name = match.player1_username || 'Jugador 1';
        const player2Name = match.player2_username || '(vacío)';

        return `
            <li class="match-item ${isWaiting ? 'waiting' : ''}" data-match-id="${match.id}" id="match-item-${match.id}">
                <div class="match-header">
                    <div>
                        <div class="match-info">
                            <strong>${player1Name}</strong>
                            ${!isWaiting ? ` vs <strong>${player2Name}</strong>` : ` (esperando oponente)`}
                        </div>
                        <div class="timestamp">Turno ${match.current_turn} &bull; ${new Date(match.created_at).toLocaleString()}</div>
                    </div>
                    <span class="badge ${badge}">${badgeText}</span>
                </div>
            </li>
        `;
    }).join('');
}

// ==================== INIT ====================
window.onload = () => {
    const token = sessionStorage.getItem('adminToken');
    if (token) {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        connectWebSocket();
    }
    
    // Agregar event listeners
    document.getElementById('loginButton').addEventListener('click', login);
    document.getElementById('passwordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });

    // Refresh inspector
    document.getElementById('refreshInspector').addEventListener('click', () => {
        if (currentInspectMatchId) inspectMatch(currentInspectMatchId);
    });

    // Event delegation: click en partida de la lista
    document.getElementById('matchList').addEventListener('click', (e) => {
        const li = e.target.closest('[data-match-id]');
        if (li) inspectMatch(li.dataset.matchId);
    });

    // Event delegation: botones disconnect/block en listas de usuarios
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const userId = btn.dataset.userId;
        const username = btn.dataset.username;
        if (action === 'disconnect') disconnectUser(userId, username);
        if (action === 'block') blockUser(userId, username);
    });
};

// ==================== MATCH INSPECTOR ====================
async function inspectMatch(matchId) {
    const token = sessionStorage.getItem('adminToken');
    if (!token) return;

    // Marcar item seleccionado
    document.querySelectorAll('.match-item').forEach(el => el.classList.remove('selected'));
    const item = document.getElementById(`match-item-${matchId}`);
    if (item) item.classList.add('selected');

    currentInspectMatchId = matchId;
    document.getElementById('refreshInspector').style.display = 'inline-block';
    document.getElementById('inspectorContent').innerHTML = '<div class="inspector-placeholder">⏳ Cargando...</div>';

    try {
        const res = await fetch(`${API_URL}/api/admin/matches/${matchId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        renderInspector(data);
    } catch (err) {
        document.getElementById('inspectorContent').innerHTML =
            `<div class="inspector-placeholder">❌ Error: ${err.message}</div>`;
    }
}

function refreshInspector() {
    if (currentInspectMatchId) inspectMatch(currentInspectMatchId);
}

function renderInspector(d) {
    const phaseLabel = {
        player1_turn: '🎯 Turno J1', player2_turn: '🎯 Turno J2',
        starting: '🚀 Iniciando', waiting: '⏳ Esperando', finished: '🏁 Terminada'
    }[d.phase] || d.phase;

    const renderZone = (cards, zoneName) => {
        if (!cards || cards.length === 0) return `<span class="zone-empty">vacío</span>`;
        return cards.map(c => {
            const modeCls = c.mode !== 'normal' ? `mode-${c.mode}` : '';
            const rarCls = `rarity-${c.rarity}`;
            const modeIcon = c.mode === 'defense' ? '🛡️' : c.mode === 'evasion' ? '💨' : '';
            const stats = c.knight ? `ATK:${c.knight.atk} DEF:${c.knight.ar} HP:${c.knight.hp} CE:${c.knight.ce}` : `cost:${c.cost}`;
            const posLabel = (zoneName === 'field_knight' || zoneName === 'field_support') ? ` [${c.position}]` : '';
            return `<div class="card-chip ${rarCls} ${modeCls}" title="${c.instance_id}">
                <span class="cname">${modeIcon}${c.name}${posLabel}</span>
                <span class="cmeta">${c.type} · ${stats}</span>
            </div>`;
        }).join('');
    };

    const renderPlayer = (p, zones, isActive) => {
        const zoneDefs = [
            { key: 'hand',         label: '🤚 Mano' },
            { key: 'field_knight', label: '⚔️ Campo (Caballeros)' },
            { key: 'field_support',label: '✨ Campo (Técnicas/Soporte)' },
            { key: 'field_helper', label: '🧑‍🤝‍🧑 Helper' },
            { key: 'yomotsu',      label: '💀 Yomotsu' },
            { key: 'cositos',      label: '🔮 Cositos' },
        ];
        return `
            <div class="player-box ${isActive ? 'active-player' : ''}">
                <h3>
                    👤 ${p.username}
                    ${isActive ? '<span class="turn-badge">SU TURNO</span>' : ''}
                </h3>
                <div class="player-stats">
                    <div class="stat-chip life"><span class="num">${p.life}</span><span class="lbl">Vida</span></div>
                    <div class="stat-chip cosmos"><span class="num">${p.cosmos}</span><span class="lbl">Cosmos</span></div>
                    <div class="stat-chip deck"><span class="num">${p.deck_remaining}</span><span class="lbl">Mazo</span></div>
                </div>
                <div class="zones-section">
                    ${zoneDefs.map(z => `
                        <h4>${z.label} (${(zones[z.key] || []).length})</h4>
                        <div class="zone-row">${renderZone(zones[z.key], z.key)}</div>
                    `).join('')}
                </div>
            </div>`;
    };

    document.getElementById('inspectorContent').innerHTML = `
        <div class="inspector-meta">
            <div class="inspector-meta-item">
                <div class="label">Turno</div>
                <div class="value turn">${d.current_turn}</div>
            </div>
            <div class="inspector-meta-item">
                <div class="label">Fase</div>
                <div class="value">${phaseLabel}</div>
            </div>
            <div class="inspector-meta-item">
                <div class="label">ID</div>
                <div class="value" style="font-size:11px;font-family:monospace;color:#6b7280">${d.id}</div>
            </div>
            <div class="inspector-meta-item">
                <div class="label">Creada</div>
                <div class="value" style="font-size:13px">${new Date(d.created_at).toLocaleString()}</div>
            </div>
        </div>
        <div class="players-row">
            ${renderPlayer(d.player1, d.zones.player1, d.current_player === 1)}
            ${renderPlayer(d.player2, d.zones.player2, d.current_player === 2)}
        </div>
    `;
}

// ==================== ADMIN ACTIONS ====================
function disconnectUser(userId, username) {
    if (!confirm(`¿Desconectar a ${username}?`)) return;
    
    console.log(`🔨 Desconectando a ${username}`);
    sendEvent('admin_disconnect_user', { user_id: userId });
}

function blockUser(userId, username) {
    if (!confirm(`¿Bloquear a ${username}? Esto lo desconectará inmediatamente.`)) return;
    
    console.log(`🚫 Bloqueando a ${username}`);
    sendEvent('admin_block_user', { user_id: userId });
}
