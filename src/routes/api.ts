import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// Get all users (contacts)
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    });
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get messages for a specific user
router.get("/users/:id/messages", async (req, res) => {
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

// Get all appointments
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

// Get CRM stats
router.get("/stats", async (req, res) => {
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

    res.json({
      totalUsers,
      totalLeads,
      totalClients,
      totalAppointments,
      conversionRate: totalUsers > 0 ? ((totalClients / totalUsers) * 100).toFixed(1) + "%" : "0%",
      topIntent
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
