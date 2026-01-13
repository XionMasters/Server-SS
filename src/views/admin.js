let ws = null;
const API_URL = window.location.origin;

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
                    <button class="btn-disconnect" onclick="disconnectUser('${user.id}', '${user.username}')" title="Desconectar">
                        🔌
                    </button>
                    <button class="btn-block" onclick="blockUser('${user.id}', '${user.username}')" title="Bloquear">
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
            <li class="match-item ${isWaiting ? 'waiting' : ''}">
                <div class="match-header">
                    <div>
                        <div class="match-info">
                            <strong>${player1Name}</strong>
                            ${!isWaiting ? ` vs <strong>${player2Name}</strong>` : ` (esperando oponente)`}
                        </div>
                        <div class="timestamp">${new Date(match.created_at).toLocaleString()}</div>
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
};

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
