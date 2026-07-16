import express from "express";
import dotenv from "dotenv";
import webhookRoutes from "./routes/webhook";
import apiRoutes from "./routes/api";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());

app.use("/api/webhook", webhookRoutes);
app.use("/api", apiRoutes);

import { ReminderService } from "./services/reminderService";

// Servir la interfaz web estática
app.use(express.static(path.join(__dirname, "../public")));

// Iniciar cron jobs
ReminderService.start();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
