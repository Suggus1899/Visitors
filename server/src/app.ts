import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import config from "./config/AppConfig";
import logger from "./config/logger";
import { errorHandler } from "./middleware/error";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { apiLimiter } from "./middleware/rateLimiter";
import { mustChangePassword } from "./middleware/mustChangePassword";
// Clean Architecture routes
import visitCleanRoutes from "./routes/visit-clean.routes";
import reportCleanRoutes from "./routes/report-clean.routes";
import visitorCleanRoutes from "./routes/visitor-clean.routes";
import backupCleanRoutes from "./routes/backup-clean.routes";
import authCleanRoutes from "./routes/auth-clean.routes";
import auditCleanRoutes from "./routes/audit-clean.routes";
import privacyCleanRoutes from "./routes/privacy-clean.routes";
import superadminRoutes from "./routes/superadmin.routes";
import platformRoutes from "./routes/platform.routes";
import eventsRoutes from "./routes/events.routes";
import healthRoutes from "./routes/health.routes";
import tenantFeaturesRoutes from "./routes/tenant-features.routes";
import { captureClientInfo } from "./middleware/ipCapture";
import { firewall } from "./middleware/firewall";

const app = express();

// Application-level firewall (IP blocking, attack pattern detection)
app.use(firewall);

// Enhanced security headers via helmet
app.use(
  helmet({
    // Content Security Policy - dynamic based on environment
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://ui-avatars.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for React development
        connectSrc: ["'self'", "ws:", "wss:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Needed for some third-party scripts
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow BLOB image endpoints to be loaded cross-origin (frontend on :5173, API on :3000)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
    xDnsPrefetchControl: {
      allow: false,
    },
    xFrameOptions: {
      action: "deny",
    },
  }),
);

// Dynamic CORS configuration for multiple environments
const getAllowedOrigins = (): string[] => {
  const origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:80",
    "https://localhost:443",
    "https://localhost",
  ];

  // Add origins from environment variable
  if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(",").map((origin) =>
      origin.trim(),
    );
    origins.push(...envOrigins);
  }

  // Add production domain if configured
  if (process.env.PRODUCTION_DOMAIN) {
    origins.push(`https://${process.env.PRODUCTION_DOMAIN}`);
    origins.push(`http://${process.env.PRODUCTION_DOMAIN}`);
  }

  return [...new Set(origins)]; // Remove duplicates
};

const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow subdomains of production domain
      if (process.env.PRODUCTION_DOMAIN) {
        const productionDomain = process.env.PRODUCTION_DOMAIN;
        if (
          origin.endsWith(`.${productionDomain}`) ||
          origin === `https://${productionDomain}` ||
          origin === `http://${productionDomain}`
        ) {
          return callback(null, true);
        }
      }

      // Reject unlisted origins
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-App-Source",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    credentials: true,
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
    preflightContinue: false,
  }),
);

// T-09: Set body size limit to prevent DoS via large payloads
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser()); // Hybrid cookie+header auth (Next.js SSR + API clients)
app.use(captureClientInfo); // Captura IP y userAgent para auditoría

// Static photos directory routing removed - photos are served from DB BLOB via API endpoints

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

// Healthcheck endpoint (exempt from rate limiting)
app.use("/api/v1/health", healthRoutes);

// Global Rate Limiting
app.use("/api", apiLimiter);

// Must Change Password Middleware (applies to all protected routes)
app.use("/api", mustChangePassword);

// T-06: Swagger Documentation — disabled in production, protected in development
if (config.nodeEnv !== "production") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Routes
// Clean Architecture API v1
app.use("/api", tenantFeaturesRoutes);
app.use("/api", visitCleanRoutes);
app.use("/api", reportCleanRoutes);
app.use("/api", visitorCleanRoutes);
app.use("/api", backupCleanRoutes);
app.use("/api", authCleanRoutes);
app.use("/api", auditCleanRoutes);
app.use("/api", privacyCleanRoutes);
app.use("/api", superadminRoutes);
app.use("/api", eventsRoutes);

// Platform (superadmin) API — mounted at /platform so the full paths are
// /platform/v1/*. The platform frontend (apps/platform) targets these paths
// directly. Each route applies verifyToken + isSuperAdmin internally.
app.use("/platform", platformRoutes);

// Global error handler - must be last middleware
app.use(errorHandler);

export default app;
