import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import webhookRoutes from "./routes/webhook";
import apiRoutes from "./routes/api";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/productRoutes";
import path from "path";
import { requireAuth, requireAuthHtml } from "./middleware/auth";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

// Rutas públicas
app.use("/api/webhook", webhookRoutes);
app.use("/api/auth", authRoutes);

// Servir archivos públicos del login sin protección
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "../public/login.html")));
app.get("/login.js", (req, res) => res.sendFile(path.join(__dirname, "../public/login.js")));
app.get("/style.css", (req, res) => res.sendFile(path.join(__dirname, "../public/style.css")));

// Rutas protegidas
app.use("/api", requireAuth, apiRoutes);
app.use("/api", requireAuth, productRoutes);

import { ReminderService } from "./services/reminderService";
import { BotDataService } from "./services/botDataService";

// Proteger index.html
app.get("/", requireAuthHtml, (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));
app.get("/index.html", requireAuthHtml, (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

// Servir el resto de archivos estáticos (JS/CSS)
app.use(express.static(path.join(__dirname, "../public")));

// Asegurar tablas del bot en la base de datos e iniciar cron jobs
BotDataService.ensureTables();
ReminderService.start();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
