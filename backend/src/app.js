const express = require("express");
    const cors = require("cors");
    const helmet = require("helmet");
    const morgan = require("morgan");
    const rateLimit = require("express-rate-limit");

    const authRoutes    = require("./routes/auth.routes");
    const catalogRoutes = require("./routes/catalog.routes");
    const ordersRoutes  = require("./routes/orders.routes");
    const returnsRefundsRoutes = require("./routes/returns-refunds.routes");
    const chatRoutes    = require("./routes/chat.routes");
    const assistantRoutes = require("./routes/assistant.routes");
    const fieldRoutes   = require("./routes/field.routes");
    const adminRoutes   = require("./routes/admin.routes");
    const crmRoutes     = require("./routes/crm.routes");
    const clientRoutes  = require("./routes/client.routes");
    const { adminRouter: reportsAdminRouter, fieldRouter: reportsFieldRouter } = require("./routes/reports.routes");
    const { userRouter: notificationsUserRouter, adminRouter: notificationsAdminRouter } = require("./routes/notifications.routes");

    const app = express();
    app.set("trust proxy", 1);
    app.use(helmet());

    const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || origin.includes(".devtunnels.ms") || origin.includes(".trycloudflare.com") ||
          origin.includes(".ngrok") || origin.includes("localhost")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    };
    app.use(cors(corsOptions));
    app.options("/{*path}", cors(corsOptions));
    app.use(express.json({ limit: "1mb" }));
    app.use(morgan("dev"));

    app.use("/api/auth", rateLimit({
    windowMs: 15 * 60 * 1000, limit: 50,
    standardHeaders: "draft-7", legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in a few minutes." },
    }));
    app.use("/api", rateLimit({
    windowMs: 60 * 1000, limit: 300,
    standardHeaders: "draft-7", legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
    }));

    app.get("/health", (_req, res) => res.json({ ok: true, service: "recruweb-backend", ts: new Date().toISOString() }));

    // KYC document downloads — authorization is the short-lived signed token
// itself (minted only after an owner/admin check in getDocumentUrl).
const { downloadHandler } = require("./config/fileStorage");
app.get("/api/files/kyc/:token", downloadHandler);

app.use("/api/auth",          authRoutes);
    app.use("/api/catalog",       catalogRoutes);
    app.use("/api/orders",        ordersRoutes);
    app.use("/api",               returnsRefundsRoutes);
    app.use("/api/chat",          chatRoutes);
    app.use("/api/assistant",     assistantRoutes);
    app.use("/api/field",         fieldRoutes);
    app.use("/api/admin",         adminRoutes);
    app.use("/api/client",        clientRoutes);
    app.use("/api/field/crm",     crmRoutes);
    app.use("/api/admin/reports", reportsAdminRouter);
    app.use("/api/field/reports", reportsFieldRouter);

    // Notifications — user (any auth) + admin
    app.use("/api/notifications",         notificationsUserRouter);
    app.use("/api/admin/notifications",   notificationsAdminRouter);

    app.use((_req, res) => res.status(404).json({ error: "Not found" }));
    app.use((err, _req, res, _next) => {
    console.error("[recruweb-backend] error:", err.message);
    res.status(err.status || 500).json({ error: err.publicMessage || "Internal server error" });
    });

    module.exports = app;
    