import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

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

    // Send via WhatsApp
    await WhatsappService.sendMessage(user.phone, content);
    
    // Save to DB with isHuman = true
    await ConversationService.addMessage(user.id, "assistant", content, true);
    
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
    
    let sentCount = 0;
    for (const id of userIds) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (user && user.phone) {
        await WhatsappService.sendMessage(user.phone, message);
        await ConversationService.addMessage(user.id, "assistant", message, true); // log as human/manual
        sentCount++;
      }
    }
    
    res.json({ success: true, sentCount });
  } catch (error) {
    console.error("Error in broadcast:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
