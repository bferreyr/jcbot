import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireRole } from "../middleware/auth";
import { SSEService } from "../services/sseService";

const router = Router();
const prisma = new PrismaClient();

// Stream endpoint for real-time updates -> ALL STAFF
router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  SSEService.addClient(res);
});

// Get all users (contacts) -> ADMIN, DIOS, EXPERTO
router.get("/users", requireRole(["ADMIN", "DIOS", "EXPERTO"]), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        _count: {
          select: { messages: true, appointments: true }
        }
      }
    });
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get messages for a specific user -> ADMIN, DIOS, EXPERTO
router.get("/users/:id/messages", requireRole(["ADMIN", "DIOS", "EXPERTO"]), async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await prisma.message.findMany({
      where: {
        userId: id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Mark as read when an admin opens the chat
    await prisma.user.update({
      where: { id },
      data: { hasUnreadMessages: false },
    });
    
    // Notify clients that unread status changed
    SSEService.notifyUpdate();

    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all appointments -> TODOS (JUNIOR, EXPERTO, DIOS, ADMIN)
router.get("/appointments", async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      include: {
        user: true // Include user data to show name/phone
      },
      orderBy: {
        date: "asc"
      }
    });
    res.json(appointments);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get CRM stats -> SOLO ADMIN
router.get("/stats", requireRole(["ADMIN"]), async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalLeads = await prisma.user.count({ where: { status: "LEAD" } });
    const totalClients = await prisma.user.count({ where: { status: "CLIENTE" } });
    const totalAppointments = await prisma.appointment.count();
    
    // Most common intent (basic implementation)
    const intents = await prisma.user.groupBy({
      by: ['lastIntent'],
      _count: {
        lastIntent: true,
      },
      where: {
        lastIntent: { not: null },
      },
      orderBy: {
        _count: {
          lastIntent: 'desc',
        },
      },
      take: 1,
    });
    
    const topIntent = intents.length > 0 ? intents[0].lastIntent : "N/A";

    // FAQs
    const faqs = await prisma.fAQLog.groupBy({
      by: ['question'],
      _count: { question: true },
      orderBy: { _count: { question: 'desc' } },
      take: 5
    });

    // Drop-offs (Last message was from assistant > 24h ago)
    const dropoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    
    const dropoffUsers = await prisma.user.findMany({
      where: {
        messages: {
          some: {
            createdAt: { lt: dropoffDate }
          }
        }
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    let dropoffsCount = 0;
    const dropoffIntents: Record<string, number> = {};

    for (const u of dropoffUsers) {
      if (u.messages.length > 0 && u.messages[0].role === 'assistant' && u.messages[0].createdAt < dropoffDate) {
        dropoffsCount++;
        const intent = u.lastIntent || 'General';
        dropoffIntents[intent] = (dropoffIntents[intent] || 0) + 1;
      }
    }

    const topDropoffIntent = Object.entries(dropoffIntents)
      .sort((a, b) => b[1] - a[1])
      .map(entry => ({ intent: entry[0], count: entry[1] }))
      .slice(0, 3);

    const dropoffUsersList = dropoffUsers
      .filter(u => u.messages.length > 0 && u.messages[0].role === 'assistant' && u.messages[0].createdAt < dropoffDate)
      .map(u => ({ id: u.id, name: u.name, phone: u.phone }));

    res.json({
      totalUsers,
      totalLeads,
      totalClients,
      totalAppointments,
      conversionRate: totalUsers > 0 ? ((totalClients / totalUsers) * 100).toFixed(1) + "%" : "0%",
      topIntent,
      topFaqs: faqs.map(f => ({ question: f.question, count: f._count.question })),
      dropoffsCount,
      topDropoffIntent,
      dropoffUsersList
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

import { WhatsappService } from "../services/whatsappService";
import { ConversationService } from "../services/conversationService";

// Send manual message from panel -> ADMIN, DIOS
router.post("/users/:id/message", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }
    
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const username = (req as any).user?.username || "Staff";

    // Send via WhatsApp
    await WhatsappService.sendMessage(user.phone, content);
    
    // Save to DB with isHuman = true and sentByName
    await ConversationService.addMessage(user.id, "assistant", content, true, username);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error sending manual message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Toggle Bot Status -> ADMIN, DIOS
router.post("/users/:id/toggle-bot", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { paused } = req.body;
    
    const user = await prisma.user.update({
      where: { id },
      data: { botPaused: paused }
    });
    
    res.json({ success: true, botPaused: user.botPaused });
  } catch (error) {
    console.error("Error toggling bot:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

import { GeminiService } from "../services/geminiService";

// Summarize Chat -> ADMIN, DIOS, EXPERTO
router.get("/users/:id/summary", requireRole(["ADMIN", "DIOS", "EXPERTO"]), async (req, res) => {
  try {
    const { id } = req.params;
    const history = await ConversationService.getHistory(id, 30); // get last 30 msgs
    
    if (history.length === 0) {
      return res.json({ summary: "No hay mensajes en esta conversación." });
    }
    
    const mapped = history.map(h => ({ role: h.role, content: h.content }));
    const summary = await GeminiService.summarizeChat(mapped);
    
    res.json({ summary });
  } catch (error) {
    console.error("Error summarizing chat:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Broadcast Message -> ADMIN, DIOS
router.post("/broadcast", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { message, userIds } = req.body;
    
    if (!message || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: "Message and userIds array are required" });
    }
    
    const username = (req as any).user?.username || "Staff";
    let sentCount = 0;
    
    for (const id of userIds) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (user && user.phone) {
        await WhatsappService.sendMessage(user.phone, message);
        await ConversationService.addMessage(user.id, "assistant", message, true, username);
        sentCount++;
      }
    }
    
    res.json({ success: true, sentCount });
  } catch (error) {
    console.error("Error in broadcast:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ==========================================
// REPAIRS (REPARACIONES) -> ADMIN, DIOS
// ==========================================

router.get("/repairs", requireRole(["ADMIN", "DIOS", "EXPERTO"]), async (req, res) => {
  try {
    const repairs = await prisma.repair.findMany({
      orderBy: [{ model: "asc" }, { part: "asc" }, { createdAt: "desc" }]
    });
    res.json(repairs);
  } catch (error) {
    console.error("Error fetching repairs:", error);
    res.status(500).json({ error: "Error al obtener las reparaciones" });
  }
});

router.post("/repairs", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { model, part, quality, price, estimatedTime, notes } = req.body;
    if (!model || !part || !quality || !price || !estimatedTime) {
      return res.status(400).json({ error: "Modelo, parte, calidad, precio y demora son obligatorios" });
    }
    const repair = await prisma.repair.create({
      data: {
        model: String(model).trim(),
        part: String(part).trim(),
        quality: String(quality).trim(),
        price: String(price).trim(),
        estimatedTime: String(estimatedTime).trim(),
        notes: notes ? String(notes).trim() : null
      }
    });
    res.status(201).json(repair);
  } catch (error) {
    console.error("Error creating repair:", error);
    res.status(500).json({ error: "Error al guardar la reparación" });
  }
});

router.put("/repairs/:id", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { model, part, quality, price, estimatedTime, notes } = req.body;
    const updated = await prisma.repair.update({
      where: { id },
      data: {
        model: String(model).trim(),
        part: String(part).trim(),
        quality: String(quality).trim(),
        price: String(price).trim(),
        estimatedTime: String(estimatedTime).trim(),
        notes: notes ? String(notes).trim() : null
      }
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating repair:", error);
    res.status(500).json({ error: "Error al actualizar la reparación" });
  }
});

router.delete("/repairs/:id", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.repair.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting repair:", error);
    res.status(500).json({ error: "Error al eliminar la reparación" });
  }
});

// ==========================================
// PLAN CANJE -> ADMIN, DIOS
// ==========================================

router.get("/plan-canje", requireRole(["ADMIN", "DIOS", "EXPERTO"]), async (req, res) => {
  try {
    const items = await prisma.planCanje.findMany({
      orderBy: [{ model: "asc" }, { createdAt: "desc" }]
    });
    res.json(items);
  } catch (error) {
    console.error("Error fetching plan canje:", error);
    res.status(500).json({ error: "Error al obtener Plan Canje" });
  }
});

router.post("/plan-canje", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { model, condition, price, notes } = req.body;
    if (!model || !condition || !price) {
      return res.status(400).json({ error: "Modelo, condición y valor son obligatorios" });
    }
    const item = await prisma.planCanje.create({
      data: {
        model: String(model).trim(),
        condition: String(condition).trim(),
        price: String(price).trim(),
        notes: notes ? String(notes).trim() : null
      }
    });
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating plan canje:", error);
    res.status(500).json({ error: "Error al guardar en Plan Canje" });
  }
});

router.put("/plan-canje/:id", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { model, condition, price, notes } = req.body;
    const updated = await prisma.planCanje.update({
      where: { id },
      data: {
        model: String(model).trim(),
        condition: String(condition).trim(),
        price: String(price).trim(),
        notes: notes ? String(notes).trim() : null
      }
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating plan canje:", error);
    res.status(500).json({ error: "Error al actualizar Plan Canje" });
  }
});

router.delete("/plan-canje/:id", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.planCanje.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting plan canje:", error);
    res.status(500).json({ error: "Error al eliminar de Plan Canje" });
  }
});

// ==========================================
// BUSINESS INFO (INFO DEL NEGOCIO) -> ADMIN, DIOS
// ==========================================

router.get("/business-info", requireRole(["ADMIN", "DIOS", "EXPERTO"]), async (req, res) => {
  try {
    const info = await prisma.businessInfo.findMany({
      orderBy: { createdAt: "asc" }
    });
    res.json(info);
  } catch (error) {
    console.error("Error fetching business info:", error);
    res.status(500).json({ error: "Error al obtener información del negocio" });
  }
});

router.post("/business-info", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || !value) {
      return res.status(400).json({ error: "El tema y la descripción son obligatorios" });
    }
    const item = await prisma.businessInfo.create({
      data: {
        key: String(key).trim(),
        value: String(value).trim()
      }
    });
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating business info:", error);
    res.status(500).json({ error: "Error al guardar información del negocio" });
  }
});

router.put("/business-info/:id", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value } = req.body;
    const updated = await prisma.businessInfo.update({
      where: { id },
      data: {
        key: String(key).trim(),
        value: String(value).trim()
      }
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating business info:", error);
    res.status(500).json({ error: "Error al actualizar información del negocio" });
  }
});

router.delete("/business-info/:id", requireRole(["ADMIN", "DIOS"]), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.businessInfo.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting business info:", error);
    res.status(500).json({ error: "Error al eliminar información del negocio" });
  }
});

export default router;
