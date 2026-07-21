import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class ConversationService {
  static async getUser(phone: string, name?: string) {
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { phone, name },
      });
    } else if (name && user.name !== name) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
    }
    return user;
  }

  static async addMessage(userId: string, role: string, content: string, isHuman: boolean = false) {
    await prisma.message.create({
      data: {
        userId,
        role,
        content,
        isHuman
      },
    });
  }

  static async getHistory(userId: string, limit: number = 10) {
    const messages = await prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    
    // Devolver en orden cronológico (ascendente)
    return messages.reverse();
  }

  static async updateUserCRM(userId: string, status: string, lastIntent: string, sentiment: string = "NEUTRAL", isUrgent: boolean = false) {
    await prisma.user.update({
      where: { id: userId },
      data: { status, lastIntent, sentiment, isUrgent },
    });
  }

  static async logFAQ(category: string, question: string) {
    await prisma.fAQLog.create({
      data: {
        category,
        question
      }
    });
  }
}
