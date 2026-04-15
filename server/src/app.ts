import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import config from "./config/AppConfig";
import { errorHandler } from "./middleware/error";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { apiLimiter } from "./middleware/rateLimiter";
import { mustChangePassword } from "./middleware/mustChangePassword";
import { verifyToken } from "./middleware/auth";

// Clean Architecture routes
import visitCleanRoutes from "./routes/visit-clean.routes";
import reportCleanRoutes from "./routes/report-clean.routes";
import visitorCleanRoutes from "./routes/visitor-clean.routes";
import backupCleanRoutes from "./routes/backup-clean.routes";
import authCleanRoutes from "./routes/auth-clean.routes";
import auditCleanRoutes from "./routes/audit-clean.routes";
import privacyCleanRoutes from "./routes/privacy-clean.routes";
import superadminRoutes from "./routes/superadmin.routes";
import eventsRoutes from "./routes/events.routes";
import { captureClientInfo } from "./middleware/ipCapture";

const app = express();

// T-14: Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: false, // CSP managed by Electron
  crossOriginEmbedderPolicy: false,
}));

// Strict CORS - only allow local origins (Electron + dev)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "app://.", // Electron production
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Electron IPC, curl, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin '${origin}' not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-App-Source"],
    credentials: true,
  }),
);

// T-09: Set body size limit to prevent DoS via large payloads
app.use(express.json({ limit: '5mb' }));
app.use(captureClientInfo); // Captura IP y userAgent para auditoría

// T-08: Serve photos behind authentication middleware
const photosDir = path.join(config.dbPath, "photos");
app.use("/data/photos", verifyToken, express.static(photosDir));

// Root Landing Page
app.get("/", (req, res) => {
  res.send(`
    <style>
      body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0f2f5; }
      .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      h1 { color: #1a1a1a; margin-bottom: 1rem; }
      p { color: #4a5568; margin-bottom: 1.5rem; }
      .btn { display: inline-block; background-color: #3182ce; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 4px; font-weight: 500; transition: background-color 0.2s; }
      .btn:hover { background-color: #2c5282; }
    </style>
    <div class="container">
      <h1>Visitor Management System API</h1>
      <p>Backend Service is Running 🟢</p>
      <a href="/api-docs" class="btn">Explore API Documentation (Swagger)</a>
    </div>
  `);
});

// Global Rate Limiting
app.use("/api", apiLimiter);

// Must Change Password Middleware (applies to all protected routes)
app.use("/api", mustChangePassword);

// T-06: Swagger Documentation — disabled in production, protected in development
if (config.nodeEnv !== 'production') {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Routes
// Clean Architecture API v1
app.use("/api", visitCleanRoutes);
app.use("/api", reportCleanRoutes);
app.use("/api", visitorCleanRoutes);
app.use("/api", backupCleanRoutes);
app.use("/api", authCleanRoutes);
app.use("/api", auditCleanRoutes);
app.use("/api", privacyCleanRoutes);
app.use("/api", superadminRoutes);
app.use("/api", eventsRoutes);

// Global error handler - must be last middleware
app.use(errorHandler);

export default app;
