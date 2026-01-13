# Sistema de Chat en Tiempo Real

## Resumen
Sistema de chat global y privado integrado con WebSocket para comunicación en tiempo real entre jugadores.

## Arquitectura

### Backend

#### Modelo de Datos
```typescript
ChatMessage {
  id: UUID
  user_id: UUID
  username: string
  message: TEXT
  message_type: 'global' | 'system' | 'whisper'
  target_user_id: UUID (nullable - solo para whispers)
  created_at: timestamp
  updated_at: timestamp
}
```

**Índices:**
- `created_at` - Para consultas ordenadas por tiempo
- `user_id` - Para consultas de mensajes de usuario

#### REST API Endpoints

**GET /api/chat/messages**
- Descripción: Obtiene los últimos 50 mensajes globales
- Autenticación: ✅ Requerida (JWT)
- Respuesta: Array de mensajes ordenados cronológicamente
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "username": "string",
    "message": "string",
    "message_type": "global",
    "created_at": "timestamp"
  }
]
```

**GET /api/chat/private**
- Descripción: Obtiene mensajes privados del usuario (enviados y recibidos)
- Autenticación: ✅ Requerida (JWT)
- Respuesta: Array de mensajes privados

**DELETE /api/chat/messages/:message_id**
- Descripción: Elimina un mensaje (solo el autor puede eliminarlo)
- Autenticación: ✅ Requerida (JWT)
- Respuesta: `{ message: "Mensaje eliminado" }`

#### WebSocket Events

**Client → Server:**

1. **chat_message**
```json
{
  "event": "chat_message",
  "data": {
    "message": "string",
    "message_type": "global" | "whisper",
    "target_user_id": "uuid" // solo para whispers
  }
}
```

2. **request_online_users**
```json
{
  "event": "request_online_users"
}
```

3. **update_status**
```json
{
  "event": "update_status",
  "data": {
    "status": "online" | "in_match" | "away"
  }
}
```

**Server → Client:**

1. **chat_message** (broadcast)
```json
{
  "event": "chat_message",
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "username": "string",
    "message": "string",
    "message_type": "global" | "system" | "whisper",
    "target_user_id": "uuid",
    "created_at": "timestamp"
  }
}
```

2. **online_users** (broadcast)
```json
{
  "event": "online_users",
  "data": [
    {
      "userId": "uuid",
      "username": "string",
      "avatarUrl": "string",
      "connectedAt": "timestamp",
      "status": "online" | "in_match" | "away"
    }
  ]
}
```

3. **chat_error**
```json
{
  "event": "chat_error",
  "data": {
    "error": "string"
  }
}
```

### Lógica de Broadcast

#### Mensajes Globales
Cuando un usuario envía un mensaje global:
1. Se guarda en la base de datos (ChatMessage.create)
2. Se broadcast a TODOS los usuarios conectados
3. Se retorna confirmación al remitente

#### Mensajes Privados (Whispers)
Cuando un usuario envía un whisper:
1. Se guarda en la base de datos con `target_user_id`
2. Se envía SOLO al destinatario
3. Se envía confirmación al remitente
4. **No** se broadcast a otros usuarios

#### Lista de Usuarios en Línea
Actualización automática en:
- Usuario se conecta → se agrega a `onlineUsers` → broadcast
- Usuario cambia estado → se actualiza `onlineUsers` → broadcast  
- Usuario se desconecta → se elimina de `onlineUsers` → broadcast

**Datos de Usuario:**
- `userId` y `username` (de autenticación WebSocket)
- `avatarUrl` (obtenido de UserProfile al conectar, default: `/assets/bronzes/1.webp`)
- `connectedAt` (timestamp de conexión)
- `status` ('online' por defecto, puede cambiar a 'in_match' o 'away')

## Integración con el Sistema Existente

### WebSocket Service
El chat está integrado en `websocket.service.ts`:

**Maps utilizados:**
- `userSockets`: Map<userId, WebSocket> - Para enviar mensajes directos
- `onlineUsers`: Map<userId, OnlineUser> - Estado de presencia

**Funciones:**
- `handleChatMessage(ws, data)` - Procesa y broadcast mensajes
- `handleUpdateStatus(ws, data)` - Actualiza estado del usuario
- `sendOnlineUsersList(ws)` - Envía lista a un usuario específico
- `broadcastOnlineUsers()` - Broadcast lista a todos

### Flujo de Conexión
```
1. Cliente conecta con JWT
2. WebSocket autentica token
3. Se agrega a userSockets
4. Se consulta UserProfile para obtener avatar
5. Se agrega a onlineUsers con datos completos
6. Se broadcast lista actualizada a todos
7. Se envía evento 'connected' al cliente
```

### Flujo de Desconexión
```
1. Cliente desconecta (evento 'close')
2. Se elimina de userSockets
3. Se elimina de onlineUsers
4. Se broadcast lista actualizada a todos
5. Se actualizan stats de admin
```

## Implementación Frontend (Godot)

### Escenas Requeridas

**MainLobby.tscn** (Pantalla Principal Rediseñada)
```
VBoxContainer
├── HBoxContainer (Main Area - 80% altura)
│   ├── ChatPanel (60% ancho)
│   │   ├── ScrollContainer (mensajes)
│   │   └── HBoxContainer (input + botón)
│   └── OnlineUsersList (20% ancho)
│       └── ItemList (usuarios con avatares)
└── HBoxContainer (Navigation - 20% altura)
    ├── TextureButton (Biblioteca)
    ├── TextureButton (Perfil)
    ├── TextureButton (Tienda)
    ├── TextureButton (Partida)
    └── TextureButton (Chat)
```

### Scripts Requeridos

**ChatPanel.gd**
```gdscript
extends Control

@onready var messages_container = $ScrollContainer/VBoxContainer
@onready var message_input = $InputPanel/LineEdit
@onready var send_button = $InputPanel/Button

func _ready():
    WebSocketManager.chat_message.connect(_on_chat_message)
    send_button.pressed.connect(_send_message)
    message_input.text_submitted.connect(_send_message)

func _send_message(text = ""):
    var msg = text if text != "" else message_input.text
    if msg.strip_edges() == "":
        return
    
    WebSocketManager.send_chat_message(msg)
    message_input.clear()

func _on_chat_message(data):
    var label = Label.new()
    label.text = "[%s]: %s" % [data.username, data.message]
    messages_container.add_child(label)
    
    # Auto-scroll al final
    await get_tree().process_frame
    var scroll = $ScrollContainer
    scroll.scroll_vertical = scroll.get_v_scroll_bar().max_value
```

**OnlineUsersList.gd**
```gdscript
extends Control

@onready var user_list = $ItemList

func _ready():
    WebSocketManager.online_users.connect(_on_online_users_updated)

func _on_online_users_updated(users):
    user_list.clear()
    for user in users:
        var display_name = "%s (%s)" % [user.username, user.status]
        user_list.add_item(display_name)
        
        # Cargar avatar como icono (opcional)
        if user.avatarUrl:
            _load_avatar_icon(user.avatarUrl, user_list.item_count - 1)

func _load_avatar_icon(url, index):
    var http = HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(func(result, code, headers, body):
        if code == 200:
            var image = Image.new()
            var error = image.load_webp_from_buffer(body) if url.ends_with(".webp") else image.load_png_from_buffer(body)
            if error == OK:
                var texture = ImageTexture.create_from_image(image)
                user_list.set_item_icon(index, texture)
        http.queue_free()
    )
    
    var api_url = WebSocketManager.get_api_base_url()
    http.request(api_url + url)
```

**WebSocketManager.gd** (Agregar señales)
```gdscript
signal chat_message(data)
signal online_users(users)

func _on_websocket_message(message):
    var data = JSON.parse_string(message)
    match data.event:
        "chat_message":
            chat_message.emit(data.data)
        "online_users":
            online_users.emit(data.data)
        # ... otros eventos

func send_chat_message(message: String, type: String = "global", target_id: String = ""):
    var payload = {
        "event": "chat_message",
        "data": {
            "message": message,
            "message_type": type
        }
    }
    if type == "whisper":
        payload.data.target_user_id = target_id
    
    _send_json(payload)

func request_online_users():
    _send_json({"event": "request_online_users"})

func update_status(status: String):
    _send_json({
        "event": "update_status",
        "data": {"status": status}
    })
```

## Migración y Setup

### 1. Crear Tabla
```bash
npx ts-node src/scripts/create-chat-tables.ts
```

### 2. Verificar Tabla
```sql
SELECT * FROM pg_indexes WHERE tablename = 'chat_messages';
```

### 3. Agregar Rutas en app.ts
```typescript
import chatRoutes from './routes/chat.routes';
app.use('/api/chat', chatRoutes);
```

### 4. Compilar
```bash
npm run build
```

### 5. Iniciar Servidor
```bash
npm run dev
```

## Testing

### Test REST API
```bash
# Obtener mensajes recientes
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/chat/messages

# Obtener mensajes privados
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/chat/private
```

### Test WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
    // Autenticar
    ws.send(JSON.stringify({ 
        event: 'authenticate', 
        data: { token: 'JWT_TOKEN' } 
    }));
});

ws.on('message', (data) => {
    console.log('Received:', JSON.parse(data));
});

// Enviar mensaje
ws.send(JSON.stringify({
    event: 'chat_message',
    data: { message: 'Hola mundo!' }
}));

// Solicitar usuarios en línea
ws.send(JSON.stringify({
    event: 'request_online_users'
}));
```

## Características

✅ **Implementado:**
- Chat global en tiempo real
- Whispers (mensajes privados)
- Lista de usuarios en línea con avatares
- Estados de usuario (online, in_match, away)
- Persistencia de mensajes en PostgreSQL
- Índices para consultas eficientes
- Broadcast automático de cambios

❌ **Pendiente (Frontend):**
- UI de chat en Godot
- Lista visual de usuarios en línea
- Pantalla principal rediseñada
- Iconos de navegación generados con IA
- Notificaciones de mensajes nuevos
- Soporte para emojis/markdown
- Historial de chat scrollable

## Notas Técnicas

- Los mensajes se ordenan por `created_at DESC` en consultas REST
- El broadcast es instantáneo (WebSocket) para nuevos mensajes
- Los avatares se cargan una sola vez al conectar (performance)
- El estado 'in_match' se puede auto-actualizar cuando inicia una partida
- Los mensajes del sistema (message_type='system') solo se crean desde el backend
