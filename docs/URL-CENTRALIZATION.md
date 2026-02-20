# URL Centralization - Config Policy

## ✅ RULE: Only ApiClient Manages Base URLs

**NO component or service should hardcode `localhost`, `API_BASE_URL`, or construct full URLs.**

### Server (TypeScript/Node.js)

#### ✅ CORRECT: Profile Controller
```typescript
// profile.controller.ts - Line 46, 85, 296
// Return ONLY relative paths - client will add base URL
image_url: `/api/profile/avatar/${avatarRecord.id}/image`
```

#### ✅ CORRECT: Email Service
```typescript
// emailService.ts - Line 56
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
const verificationUrl = `${apiBaseUrl}/api/auth/verify-email?token=${token}`;
```

#### ✅ CORRECT: WebSocket Service
```typescript
// websocket.service.ts - Line 573
// Never construct URLs in WebSocket handlers
// Server returns relative path only for avatarUrl
avatarUrl = avatar?.image_url || '/assets/bronzes/1.webp';  // Relative path only
```

#### ✅ CORRECT: Admin Dashboard (Frontend)
```javascript
// admin.js - Line 2
const API_URL = window.location.origin;  // Get domain from browser
```

#### ✅ CORRECT: Console Logs
```typescript
// server.ts - Lines 23-24
console.log(`📚 API Documentation: http://localhost:${PORT}/health`);  // Only in logs
console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}`);   // Only in logs
```

#### ❌ DATABASE HOST (Exception)
```typescript
// database.ts - Line 11
host: process.env.DB_HOST || 'localhost',  // Exception: DB_HOST always needs localhost default
```

### Client (Godot/GDScript)

#### ✅ CORRECT: GameConfig
```gdscript
# GameConfig.gd - Central URL configuration
static var API_URL: String = OS.get_environment("API_URL") if OS.get_environment("API_URL") else "http://localhost:3000/api"
static var WS_URL: String = OS.get_environment("WS_URL") if OS.get_environment("WS_URL") else "ws://localhost:3000/ws"
```

**Why:** Allows environment variable override for production/deployment.

#### ✅ CORRECT: ApiClient
```gdscript
# ApiClient.gd - Singleton responsible for all HTTP
func _ready():
    base_url = GameConfig.API_URL  # Read from GameConfig only once
```

**Usage Pattern:**
```gdscript
# ✅ CORRECT - Let ApiClient add base URL
ApiClient.get_request_with_callback("/profile/user/" + user_id, tag, callback)

# ❌ WRONG - Would require fixing GameConfig or ApiClient
var full_url = "http://localhost:3000/api/profile/user/" + user_id
http.request(full_url)

# ❌ WRONG - Duplicates base URL logic
var url = GameConfig.API_URL + "/endpoint"
http.request(url)
```

#### ✅ CORRECT: OnlineUsersList (Image Loading)
```gdscript
# OnlineUsersList.gd - Use ApiClient for images
var callback = func(success: bool, image: Texture2D) -> void:
    if success and image:
        texture_rect.texture = image

ApiClient.get_image_with_callback(
    avatar_url,  # avatar_url is already relative path from server
    callback,
    "avatar_texture_%s" % avatar_url.hash()
)
```

#### ✅ CORRECT: PlayerStatusPanel
```gdscript
# PlayerStatusPanel.gd - Use ApiClient
ApiClient.get_request_with_callback(
    "/profile/user/" + user_id,
    "load_avatar_%s" % user_id,
    callback,
    false
)

# Later: Load image with relative path from server
ApiClient.get_image_with_callback(
    image_url,  # Comes from server, already relative
    callback,
    "avatar_image_%s" % player_name
)
```

## 🔄 Data Flow

### Profile Avatar Loading (Correct Flow)
```
1. Client calls: ApiClient.get_request_with_callback("/profile/user/{id}", ...)
2. ApiClient adds base URL: "http://localhost:3000/api/profile/user/{id}"
3. Server returns: { avatar: { image_url: "/api/profile/avatar/{id}/image" } }
4. Client calls: ApiClient.get_image_with_callback("/api/profile/avatar/{id}/image", ...)
5. ApiClient adds base URL: "http://localhost:3000/api/profile/avatar/{id}/image"
6. Image loads successfully ✅
```

### What NOT To Do (URL Duplication)
```
❌ Server returns: { avatar: { image_url: "http://localhost:3000/api/..." } }
❌ Client calls: ApiClient.get_image_with_callback("http://localhost:3000/api/...", ...)
❌ ApiClient tries to add base URL again: "http://localhost:3000http://localhost:3000/api/..."
❌ Result: ERROR - Invalid URL
```

## Environment Variables

### Server (.env)
```
# REQUIRED - Used for email verification links
API_BASE_URL=http://localhost:3000

# Optional - Database host (special case, always needs localhost)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cosmic_knights
DB_USER=postgres
DB_PASSWORD=password

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
```

### Client (Godot)
```
# Set before running game (optional, uses defaults if not set)
export API_URL="http://localhost:3000/api"
export WS_URL="ws://localhost:3000/ws"

# For production:
export API_URL="https://api.example.com/api"
export WS_URL="wss://api.example.com/ws"
```

## ✅ Checklist

- [x] Profile controller returns relative paths only (`/api/profile/avatar/{id}/image`)
- [x] Email service uses `process.env.API_BASE_URL` for verification URLs
- [x] WebSocket service never hardcodes URLs
- [x] GameConfig.gd uses environment variables with fallback to localhost defaults
- [x] ApiClient reads `GameConfig.API_URL` once in `_ready()`
- [x] OnlineUsersList uses ApiClient for image loading (not manual HTTPRequest)
- [x] PlayerStatusPanel uses ApiClient for all requests
- [x] Admin dashboard uses `window.location.origin` (browser's domain)
- [x] Database connections use `process.env.DB_HOST` with localhost fallback
- [x] Console logs can mention localhost (for development reference only)

## 🚀 Production Deployment

1. **Server:** Set `API_BASE_URL` environment variable
   ```bash
   export API_BASE_URL="https://api.cosmic-knights.com"
   ```

2. **Client:** Set before launching Godot app
   ```bash
   export API_URL="https://api.cosmic-knights.com/api"
   export WS_URL="wss://api.cosmic-knights.com/ws"
   ```

3. **Admin Dashboard:** Auto-detects via `window.location.origin` ✅

## 📝 Design Rationale

### Why This Pattern?

1. **Separation of Concerns**: Each layer knows its responsibility
   - Server provides data structure, not deployment URLs
   - Client configuration centralizes in GameConfig
   - ApiClient is single source of HTTP truth

2. **Flexibility**: Easy to switch servers without code changes
   - Staging: `http://staging.example.com`
   - Production: `https://api.example.com`
   - Local: `http://localhost:3000`

3. **Correctness**: No URL duplication or malformation
   - Server never outputs absolute URLs for API endpoints
   - Client has one place to manage base URLs
   - ApiClient ensures consistent URL construction

4. **Maintainability**: Future changes centralized
   - Add API versioning? Change `GameConfig.API_URL`
   - Switch servers? Update environment variable
   - No code changes needed across dozens of files

