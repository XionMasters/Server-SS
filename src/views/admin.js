let ws = null;
const API_URL = window.location.origin;
let currentInspectMatchId = null;

function fmtDate(val) {
    if (!val) return 'N/D';
    const d = new Date(val);
    return isNaN(d.getTime()) ? 'N/D' : d.toLocaleString();
}

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
                        <div class="timestamp">Turno ${match.current_turn} &bull; ${fmtDate(match.created_at)}</div>
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
            const rarCls = `rarity-${c.rarity || 'common'}`;
            let stats;
            if (c.knight) {
                const hpStr  = c.hp  != null ? `${c.hp}/${c.knight.hp}`   : `${c.knight.hp}`;
                const ceStr  = c.atk != null ? `${c.atk}`                  : `${c.knight.atk}`;
                const arStr  = c.def != null ? `${c.def}`                  : `${c.knight.ar}`;
                const cpStr  = c.cosmos != null ? `${c.cosmos}/${c.knight.ce}` : `${c.knight.ce}`;
                stats = `HP:${hpStr} CE:${ceStr} AR:${arStr} CP:${cpStr}`;
            } else {
                stats = `cost:${c.cost}`;
            }
            const posLabel = (zoneName === 'field_knight' || zoneName === 'field_support') ? ` [${c.position}]` : '';

            let extraHtml = '';
            if (zoneName === 'field_knight') {
                const hasActed = c.valid_actions ? c.valid_actions.has_acted : c.is_exhausted;
                const actedBadge = hasActed
                    ? `<span class="acted-badge acted">✗ YA ACTUÓ</span>`
                    : `<span class="acted-badge free">✓ LIBRE</span>`;

                const modeRaw = c.mode;
                const modeStr = (!modeRaw || modeRaw === false) ? 'normal'
                              : (modeRaw === true) ? 'defense' : String(modeRaw);
                const modeLabel = { normal: '—', defense: '🛡️ Defensa', evasion: '💨 Evasión', prayer: '🙏 Oración' }[modeStr] || modeStr;
                const modeBadge = modeStr !== 'normal' ? `<span class="mode-badge">${modeLabel}</span>` : '';

                const effects = Array.isArray(c.status_effects) ? c.status_effects : [];
                const effectsHtml = effects.length > 0
                    ? effects.map(e => {
                        const label = { defense: 'DEFENSA', evasion: 'EVASION', prayer: 'ORACION', ce_boost: `CE+${e.value}`, ar_boost: `AR+${e.value}`, hp_boost: `HP+${e.value}` }[e.type] || e.type.toUpperCase();
                        return `<span class="effect-tag">${label} [${e.remaining_turns}t]</span>`;
                      }).join('')
                    : '';

                extraHtml = `<div class="knight-status-row">${actedBadge}${modeBadge}</div>${effectsHtml ? `<div class="effects-row">${effectsHtml}</div>` : ''}`;
            }

            return `<div class="card-chip ${rarCls}" title="${c.instance_id}">
                <span class="cname">${c.name}${posLabel}</span>
                <span class="cmeta">${c.type} · ${stats}</span>
                ${extraHtml}
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
                <div class="value" style="font-size:13px">${fmtDate(d.created_at)}</div>
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

// =============================================
// CARD MANAGER
// =============================================

let currentEditCardId = null;
let cardsCurrentOffset = 0;
const CARDS_PAGE_SIZE = 50;

// ── Tab Navigation ────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const dashEl = document.getElementById('tab-dashboard');
    const cardsEl = document.getElementById('tab-cards');
    if (dashEl) dashEl.classList.toggle('hidden', tab !== 'dashboard');
    if (cardsEl) cardsEl.classList.toggle('hidden', tab !== 'cards');
    if (tab === 'cards') loadCards(0);
}

// ── Filters ───────────────────────────────────────────────────────
function resetFilters() {
    ['filter-search', 'filter-cost-min', 'filter-cost-max'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['filter-type', 'filter-rarity', 'filter-element'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadCards(0);
}

async function loadCards(offset) {
    const token = sessionStorage.getItem('adminToken');
    if (!token) return;
    offset = offset || 0;
    cardsCurrentOffset = offset;

    const search  = document.getElementById('filter-search')?.value.trim() || '';
    const type    = document.getElementById('filter-type')?.value || '';
    const rarity  = document.getElementById('filter-rarity')?.value || '';
    const element = document.getElementById('filter-element')?.value || '';
    const costMin = document.getElementById('filter-cost-min')?.value || '';
    const costMax = document.getElementById('filter-cost-max')?.value || '';

    const params = new URLSearchParams({ limit: String(CARDS_PAGE_SIZE), offset: String(offset) });
    if (search)  params.set('search', search);
    if (type)    params.set('type', type);
    if (rarity)  params.set('rarity', rarity);
    if (element) params.set('element', element);
    if (costMin) params.set('cost_min', costMin);
    if (costMax) params.set('cost_max', costMax);

    const wrap = document.getElementById('cards-table-wrap');
    if (wrap) wrap.innerHTML = '<div class="empty-state">⏳ Cargando...</div>';

    try {
        const res = await fetch(`${API_URL}/api/admin/cards?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        renderCardsTable(data.cards, data.total, offset);
    } catch (err) {
        if (wrap) wrap.innerHTML = `<div class="empty-state">❌ ${err.message}</div>`;
    }
}

function renderCardsTable(cards, total, offset) {
    const rarityColors = { common:'#9ca3af', rare:'#3b82f6', epic:'#8b5cf6', legendary:'#f59e0b', divine:'#ec4899' };
    const typeEmoji = { knight:'⚔️', technique:'✨', item:'📦', stage:'🗺️', helper:'🤝', event:'🎴' };
    const wrap = document.getElementById('cards-table-wrap');
    const pag = document.getElementById('cards-pagination');

    if (cards.length === 0) {
        if (wrap) wrap.innerHTML = '<div class="empty-state">Sin resultados para los filtros aplicados</div>';
        if (pag) pag.style.display = 'none';
        return;
    }

    const rows = cards.map(c => {
        const k = c.card_knight;
        const stats = k
            ? `<td style="text-align:center">${k.attack}</td><td style="text-align:center">${k.defense}</td><td style="text-align:center">${k.health}</td>`
            : `<td colspan="3" style="text-align:center;color:#d1d5db">—</td>`;
        const rarColor = rarityColors[c.rarity] || '#9ca3af';
        const img = c.image_url
            ? `<img src="${API_URL}/assets/${c.image_url}" onerror="this.style.display='none'" style="height:40px;border-radius:3px;vertical-align:middle" alt="">`
            : '<span style="color:#d1d5db;font-size:20px">🃏</span>';
        return `<tr>
            <td style="width:50px">${img}</td>
            <td><code style="font-size:11px;color:#6b7280">${escHtml(c.code)}</code></td>
            <td><strong>${escHtml(c.name)}</strong></td>
            <td>${typeEmoji[c.type] || ''} <span style="font-size:12px">${c.type}</span></td>
            <td><span style="color:${rarColor};font-weight:700;font-size:12px">${c.rarity}</span></td>
            <td style="text-align:center">${c.cost ?? 0}</td>
            ${stats}
            <td><button onclick="openCardEditor('${c.id}')" class="btn-sm">✏️ Editar</button></td>
        </tr>`;
    }).join('');

    if (wrap) wrap.innerHTML = `
        <table class="cards-table">
            <thead><tr>
                <th></th><th>Code</th><th>Nombre</th><th>Tipo</th><th>Rareza</th>
                <th>Costo</th><th>ATK</th><th>DEF</th><th>HP</th><th>Acción</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

    if (pag) {
        pag.style.display = 'flex';
        const totalPages = Math.ceil(total / CARDS_PAGE_SIZE);
        const currentPage = Math.floor(offset / CARDS_PAGE_SIZE);
        const from = offset + 1;
        const to = Math.min(offset + CARDS_PAGE_SIZE, total);
        let html = `<span>Mostrando ${from}–${to} de ${total} cartas</span>`;
        if (currentPage > 0) html += `<button onclick="loadCards(${(currentPage-1)*CARDS_PAGE_SIZE})" class="btn-ghost">← Anterior</button>`;
        if (currentPage < totalPages - 1) html += `<button onclick="loadCards(${(currentPage+1)*CARDS_PAGE_SIZE})" class="btn-ghost">Siguiente →</button>`;
        pag.innerHTML = html;
    }
}

// ── Card Editor Open/Close ─────────────────────────────────────────
function openNewCard() {
    currentEditCardId = null;
    document.getElementById('cm-modal-title').textContent = 'Nueva Carta';
    document.getElementById('cm-delete-btn').classList.add('hidden');
    resetCardForm();
    switchFormTab('base');
    document.getElementById('cm-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

async function openCardEditor(cardId) {
    const token = sessionStorage.getItem('adminToken');
    try {
        const res = await fetch(`${API_URL}/api/admin/cards/${cardId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const card = await res.json();
        currentEditCardId = cardId;
        document.getElementById('cm-modal-title').textContent = `Editar: ${card.code}`;
        document.getElementById('cm-delete-btn').classList.remove('hidden');
        populateCardForm(card);
        switchFormTab('base');
        document.getElementById('cm-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } catch (err) {
        alert('Error al cargar carta: ' + err.message);
    }
}

function closeCardEditor() {
    document.getElementById('cm-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function onModalBackdropClick(e) {
    if (e.target.id === 'cm-modal') closeCardEditor();
}

// ── Form Reset / Populate ─────────────────────────────────────────
function resetCardForm() {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };

    setVal('f-code', ''); setVal('f-type', 'knight'); setVal('f-rarity', 'common');
    setVal('f-cost', '0'); setVal('f-generate', '0'); setVal('f-max-copies', '3');
    setChk('f-unique', false);
    setVal('f-faction', ''); setVal('f-element', ''); setVal('f-collection', ''); setVal('f-image-url', '');
    ['es','en','pt'].forEach(l => { setVal(`f-name-${l}`, ''); setVal(`f-desc-${l}`, ''); });
    setVal('f-attack', '0'); setVal('f-defense', '0'); setVal('f-health', '6'); setVal('f-cosmos', '6');
    setChk('f-can-defend', true); setVal('f-defense-reduction', '0.5'); setVal('f-rank', '');
    document.getElementById('abilities-list').innerHTML = '';
    switchCardLang('es');
    onTypeChange();
}

function populateCardForm(card) {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

    setVal('f-code', card.code);
    setVal('f-type', card.type);
    setVal('f-rarity', card.rarity);
    setVal('f-cost', card.cost ?? 0);
    setVal('f-generate', card.generate ?? 0);
    setVal('f-max-copies', card.max_copies ?? 3);
    setChk('f-unique', card.unique);
    setVal('f-faction', card.faction);
    setVal('f-element', card.element);
    setVal('f-collection', card.collection_id);
    setVal('f-image-url', card.image_url);

    // ES texts come from base card
    setVal('f-name-es', card.name);
    setVal('f-desc-es', card.description);

    // EN and PT from translations array
    (card.translations || []).forEach(t => {
        if (t.language === 'en' || t.language === 'pt') {
            setVal(`f-name-${t.language}`, t.name);
            setVal(`f-desc-${t.language}`, t.description);
        }
    });

    // Stats
    const k = card.card_knight;
    if (k) {
        setVal('f-attack', k.attack ?? 0);
        setVal('f-defense', k.defense ?? 0);
        setVal('f-health', k.health ?? 6);
        setVal('f-cosmos', k.cosmos ?? 6);
        setChk('f-can-defend', k.can_defend !== false);
        setVal('f-defense-reduction', k.defense_reduction ?? 0.5);
        setVal('f-rank', k.rank);
    }

    // Abilities
    const list = document.getElementById('abilities-list');
    list.innerHTML = '';
    (card.card_abilities || []).forEach((ab, i) => {
        const abTranslations = {};
        (card.translations || []).forEach(t => {
            if (t.language === 'es') return;
            const abT = (t.ability_translations || {})[ab.id];
            if (abT) abTranslations[t.language] = abT;
        });
        list.appendChild(createAbilityBlock(ab, i, abTranslations));
    });

    switchCardLang('es');
    onTypeChange();
}

// ── Form Tabs ─────────────────────────────────────────────────────
function switchFormTab(tab) {
    document.querySelectorAll('.form-tab').forEach(b => b.classList.toggle('active', b.dataset.formtab === tab));
    document.querySelectorAll('.formtab-content').forEach(el => {
        el.classList.toggle('hidden', !el.id.endsWith(tab));
    });
}

function switchCardLang(lang) {
    document.querySelectorAll('#card-lang-tabs .lang-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.lang === lang));
    document.querySelectorAll('.card-lang-field').forEach(el =>
        el.classList.toggle('hidden', el.dataset.lang !== lang));
}

function onTypeChange() {
    const type = document.getElementById('f-type')?.value;
    const note = document.getElementById('stats-note');
    const fields = document.getElementById('stats-fields');
    if (note)   note.style.display   = type !== 'knight' ? '' : 'none';
    if (fields) fields.style.display = type === 'knight' ? '' : 'none';
}

// ── Ability Sub-Editor ────────────────────────────────────────────
let _abilityCounter = 0;

function addAbility() {
    const list = document.getElementById('abilities-list');
    list.appendChild(createAbilityBlock(null, _abilityCounter++, {}));
}

function createAbilityBlock(ab, idx, translations) {
    const div = document.createElement('div');
    div.className = 'ability-block';
    div.dataset.idx = idx;

    const nameEs = ab?.name || '';
    const descEs = ab?.description || '';
    const nameEn = translations.en?.name || '';
    const descEn = translations.en?.description || '';
    const namePt = translations.pt?.name || '';
    const descPt = translations.pt?.description || '';
    const abilityKey = ab?.ability_key || '';
    const abType = ab?.type || 'pasiva';
    const defaultEffects = ab?.effects ? JSON.stringify(ab.effects, null, 2) : '{\n  "trigger": "ACTIVE",\n  "actions": []\n}';

    div.innerHTML = `
        <div class="ability-header">
            <span class="ability-title">${escHtml(nameEs || '(nueva habilidad)')}</span>
            <span class="ability-type-badge">${abType}</span>
            <button type="button" onclick="toggleAbility(this)" class="ability-toggle">▲</button>
            <button type="button" onclick="removeAbility(this)" class="ability-remove">✕</button>
        </div>
        <div class="ability-body">
            <div class="form-row">
                <div class="form-group">
                    <label>Ability Key</label>
                    <input type="text" class="ab-key" value="${escHtml(abilityKey)}" placeholder="unicorn_horn" oninput="updateAbilityTitle(this)">
                </div>
                <div class="form-group sm">
                    <label>Tipo</label>
                    <select class="ab-type" onchange="updateAbilityBadge(this)">
                        <option value="pasiva" ${abType==='pasiva'?'selected':''}>pasiva</option>
                        <option value="activa" ${abType==='activa'?'selected':''}>activa</option>
                        <option value="equipamiento" ${abType==='equipamiento'?'selected':''}>equipamiento</option>
                        <option value="campo" ${abType==='campo'?'selected':''}>campo</option>
                    </select>
                </div>
            </div>
            <div class="ab-lang-tabs lang-tabs">
                <button type="button" class="lang-tab active" data-lang="es" onclick="switchAbilityLang(this,'es')">ES</button>
                <button type="button" class="lang-tab" data-lang="en" onclick="switchAbilityLang(this,'en')">EN</button>
                <button type="button" class="lang-tab" data-lang="pt" onclick="switchAbilityLang(this,'pt')">PT</button>
            </div>
            <div class="ab-lang-field" data-lang="es">
                <div class="form-group"><label>Nombre (ES)</label><input type="text" class="ab-name-es" value="${escHtml(nameEs)}" placeholder="Cuerno de Unicornio" oninput="updateAbilityTitle(this)"></div>
                <div class="form-group"><label>Descripción (ES)</label><textarea class="ab-desc-es" rows="2" placeholder="Los BA del portador causan...">${escHtml(descEs)}</textarea></div>
            </div>
            <div class="ab-lang-field hidden" data-lang="en">
                <div class="form-group"><label>Nombre (EN)</label><input type="text" class="ab-name-en" value="${escHtml(nameEn)}" placeholder="Unicorn Horn"></div>
                <div class="form-group"><label>Descripción (EN)</label><textarea class="ab-desc-en" rows="2" placeholder="Bearer's basic attacks...">${escHtml(descEn)}</textarea></div>
            </div>
            <div class="ab-lang-field hidden" data-lang="pt">
                <div class="form-group"><label>Nombre (PT)</label><input type="text" class="ab-name-pt" value="${escHtml(namePt)}" placeholder="Chifre do Unicórnio"></div>
                <div class="form-group"><label>Descripción (PT)</label><textarea class="ab-desc-pt" rows="2" placeholder="Os BA do portador...">${escHtml(descPt)}</textarea></div>
            </div>
            <div class="form-group" style="margin-top:8px">
                <label>Effects (JSON)
                    <button type="button" onclick="fmtJsonTA(this)" class="btn-xs" title="Formatear">{ }</button>
                    <button type="button" onclick="validateJsonTA(this)" class="btn-xs" title="Validar">✓</button>
                </label>
                <textarea class="ab-effects" rows="8" spellcheck="false" style="font-family:monospace;font-size:12px">${escHtml(defaultEffects)}</textarea>
            </div>
        </div>`;
    return div;
}

function updateAbilityTitle(input) {
    const block = input.closest('.ability-block');
    const nameEs = block.querySelector('.ab-name-es')?.value || block.querySelector('.ab-key')?.value || '(nueva habilidad)';
    block.querySelector('.ability-title').textContent = nameEs;
}

function updateAbilityBadge(select) {
    const block = select.closest('.ability-block');
    block.querySelector('.ability-type-badge').textContent = select.value;
}

function toggleAbility(btn) {
    const body = btn.closest('.ability-block').querySelector('.ability-body');
    body.classList.toggle('hidden');
    btn.textContent = body.classList.contains('hidden') ? '▼' : '▲';
}

function removeAbility(btn) {
    if (!confirm('¿Eliminar esta habilidad?')) return;
    btn.closest('.ability-block').remove();
}

function switchAbilityLang(btn, lang) {
    const block = btn.closest('.ability-block');
    block.querySelectorAll('.ab-lang-tabs .lang-tab').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    block.querySelectorAll('.ab-lang-field').forEach(el => el.classList.toggle('hidden', el.dataset.lang !== lang));
}

function fmtJsonTA(btn) {
    const ta = btn.closest('.form-group').querySelector('textarea');
    try {
        ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
        ta.style.borderColor = '';
    } catch (e) {
        ta.style.borderColor = '#ef4444';
        alert('JSON inválido: ' + e.message);
    }
}

function validateJsonTA(btn) {
    const ta = btn.closest('.form-group').querySelector('textarea');
    try {
        JSON.parse(ta.value);
        ta.style.borderColor = '#10b981';
        setTimeout(() => ta.style.borderColor = '', 1500);
    } catch (e) {
        ta.style.borderColor = '#ef4444';
        alert('JSON inválido: ' + e.message);
    }
}

function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Save Card ─────────────────────────────────────────────────────
async function saveCard() {
    const token = sessionStorage.getItem('adminToken');
    const type = document.getElementById('f-type').value;

    const body = {
        code:         document.getElementById('f-code').value.trim(),
        type,
        rarity:       document.getElementById('f-rarity').value,
        cost:         parseInt(document.getElementById('f-cost').value) || 0,
        generate:     parseInt(document.getElementById('f-generate').value) || 0,
        max_copies:   parseInt(document.getElementById('f-max-copies').value) || 3,
        unique:       document.getElementById('f-unique').checked,
        faction:      document.getElementById('f-faction').value.trim() || null,
        element:      document.getElementById('f-element').value || null,
        collection_id: document.getElementById('f-collection').value.trim() || null,
        image_url:    document.getElementById('f-image-url').value.trim() || null,
        playable_zones: ['battlefield'],
    };

    if (!body.code) { alert('El campo Code es obligatorio'); return; }

    // Collect translations
    body.translations = {
        es: {
            name:        document.getElementById('f-name-es').value.trim(),
            description: document.getElementById('f-desc-es').value.trim() || null,
        },
        en: {
            name:        document.getElementById('f-name-en').value.trim(),
            description: document.getElementById('f-desc-en').value.trim() || null,
        },
        pt: {
            name:        document.getElementById('f-name-pt').value.trim(),
            description: document.getElementById('f-desc-pt').value.trim() || null,
        },
    };

    // Knight stats
    body.stats = type === 'knight' ? {
        attack:            parseInt(document.getElementById('f-attack').value) || 0,
        defense:           parseInt(document.getElementById('f-defense').value) || 0,
        health:            parseInt(document.getElementById('f-health').value) || 6,
        cosmos:            parseInt(document.getElementById('f-cosmos').value) || 6,
        can_defend:        document.getElementById('f-can-defend').checked,
        defense_reduction: parseFloat(document.getElementById('f-defense-reduction').value) || 0.5,
        rank:              document.getElementById('f-rank').value || null,
    } : null;

    // Collect abilities
    body.abilities = [];
    for (const block of document.querySelectorAll('.ability-block')) {
        const key    = block.querySelector('.ab-key').value.trim();
        const abType = block.querySelector('.ab-type').value;
        const nameEs = block.querySelector('.ab-name-es').value.trim();
        const descEs = block.querySelector('.ab-desc-es').value.trim();
        const effectsRaw = block.querySelector('.ab-effects').value.trim();

        let effects = {};
        try { effects = JSON.parse(effectsRaw); } catch (e) {
            alert(`Habilidad "${nameEs || key}": Effects JSON inválido — ${e.message}`);
            return;
        }

        // Collect per-lang ability translations and merge into body.translations
        for (const lang of ['en', 'pt']) {
            const abName = block.querySelector(`.ab-name-${lang}`)?.value.trim();
            const abDesc = block.querySelector(`.ab-desc-${lang}`)?.value.trim();
            if (abName) {
                if (!body.translations[lang]) body.translations[lang] = { name: '', description: null, abilities: [] };
                if (!body.translations[lang].abilities) body.translations[lang].abilities = [];
                body.translations[lang].abilities.push({ key, name: abName, description: abDesc || '' });
            }
        }

        body.abilities.push({ ability_key: key || null, type: abType, name: nameEs, description: descEs, effects, conditions: {} });
    }

    try {
        const url    = currentEditCardId ? `${API_URL}/api/admin/cards/${currentEditCardId}` : `${API_URL}/api/admin/cards`;
        const method = currentEditCardId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Error desconocido');
        }

        closeCardEditor();
        loadCards(cardsCurrentOffset);
        showAdminToast(currentEditCardId ? '✅ Carta actualizada' : '✅ Carta creada correctamente');
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    }
}

// ── Delete Card ───────────────────────────────────────────────────
async function deleteCurrentCard() {
    if (!currentEditCardId) return;
    if (!confirm('¿Eliminar esta carta permanentemente? Se eliminarán también sus habilidades y traducciones.\nSolo se puede eliminar si ningún usuario la tiene ni está en algún mazo.')) return;

    const token = sessionStorage.getItem('adminToken');
    try {
        const res = await fetch(`${API_URL}/api/admin/cards/${currentEditCardId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 409) {
            const data = await res.json();
            const d = data.details || {};
            const lines = [data.error];
            if (d.en_inventarios) lines.push(`• En inventarios de usuarios: ${d.en_inventarios}`);
            if (d.en_mazos)       lines.push(`• En mazos: ${d.en_mazos}`);
            if (d.en_partidas)    lines.push(`• En partidas activas: ${d.en_partidas}`);
            alert(lines.join('\n'));
            return;
        }
        if (!res.ok) throw new Error(await res.text());
        closeCardEditor();
        loadCards(cardsCurrentOffset);
        showAdminToast('🗑️ Carta eliminada');
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
}

// ── Toast ─────────────────────────────────────────────────────────
function showAdminToast(msg, duration = 3000) {
    let toast = document.getElementById('admin-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'admin-toast';
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1f2937;color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._tmr);
    toast._tmr = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}
