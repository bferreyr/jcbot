import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class ConversationService {
  static async getUser(phone: string) {
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { phone },
      });
    }
    return user;
  }

  static async addMessage(userId: string, role: string, content: string) {
    await prisma.message.create({
      data: {
        userId,
        role,
        content,
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
}
