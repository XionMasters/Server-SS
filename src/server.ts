// src/server.ts
import { createServer } from 'http';
import app from './app';
import { connectDatabase } from './config/database';
import { initializeWebSocketServer } from './services/websocket.service';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDatabase();
    
    // Crear servidor HTTP
    const httpServer = createServer(app);
    
    // Configurar WebSocket nativo (compatible con Godot)
    initializeWebSocketServer(httpServer);
    
    // Iniciar servidor
    httpServer.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
};

startServer();