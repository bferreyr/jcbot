import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { WhatsappService } from './whatsappService';

const prisma = new PrismaClient();
const TIMEZONE = 'America/Argentina/Buenos_Aires';

export class ReminderService {

  // Utilidad para obtener la hora actual en Argentina pero representada en UTC, 
  // ya que los turnos se guardaron así en la BD (ej. 14:00 AR = 14:00 UTC en BD).
  private static getArgentinaFakeUTC(): Date {
      const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: TIMEZONE,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hourCycle: 'h23'
      }).formatToParts(new Date());
  
      const p: Record<string, number> = {};
      for (const part of parts) {
          if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
      }
      return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
  }

  static start() {
    console.log("Iniciando servicio de recordatorios automáticos...");

    // 1. Recordatorio a las 8:00 AM para los turnos del día
    // (Se ejecuta a las 8:00 de la mañana, hora de Argentina)
    cron.schedule('0 8 * * *', async () => {
      console.log("Ejecutando cron de 8:00 AM (Recordatorio matutino)...");
      try {
        const today = this.getArgentinaFakeUTC();
        
        // Crear rango para el día de hoy en "UTC falso"
        const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
        const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59));

        const appointments = await prisma.appointment.findMany({
          where: {
            date: {
              gte: startOfDay,
              lte: endOfDay
            },
            status: "CONFIRMED",
            morningReminderSent: false
          },
          include: { user: true }
        });

        for (const app of appointments) {
          const hour = app.date.getUTCHours().toString().padStart(2, '0');
          const minutes = app.date.getUTCMinutes().toString().padStart(2, '0');
          const timeStr = `${hour}:${minutes}`;
          
          const msg = `¡Buenos días${app.user.name ? ' ' + app.user.name : ''}! 👋\nTe recordamos que hoy a las *${timeStr} hs* tienes un turno agendado con nosotros por motivo de: *${app.reason}*.\n\n¡Te esperamos!`;
          
          await WhatsappService.sendMessage(app.user.phone, msg);
          
          await prisma.appointment.update({
            where: { id: app.id },
            data: { morningReminderSent: true }
          });
        }
      } catch (error) {
        console.error("Error en recordatorio matutino:", error);
      }
    }, {
      timezone: TIMEZONE
    });

    // 2. Recordatorio 1 hora antes (se ejecuta cada 15 minutos para revisar)
    cron.schedule('*/15 * * * *', async () => {
      try {
        const fakeUtcNow = this.getArgentinaFakeUTC();
        
        // Buscar turnos que sucedan en menos de 1 hora y 15 minutos a partir de ahora.
        const oneHourFifteenFromNow = new Date(fakeUtcNow.getTime() + 75 * 60 * 1000);

        const appointments = await prisma.appointment.findMany({
          where: {
            date: {
              gte: fakeUtcNow, // Que no haya pasado
              lte: oneHourFifteenFromNow // Que suceda en un rato
            },
            status: "CONFIRMED",
            hourlyReminderSent: false
          },
          include: { user: true }
        });

        for (const app of appointments) {
          const diffMs = app.date.getTime() - fakeUtcNow.getTime();
          const diffMins = Math.floor(diffMs / 1000 / 60);

          // Si falta entre 1 y 65 minutos
          if (diffMins <= 65 && diffMins > 0) {
            const hour = app.date.getUTCHours().toString().padStart(2, '0');
            const minutes = app.date.getUTCMinutes().toString().padStart(2, '0');
            const timeStr = `${hour}:${minutes}`;

            const msg = `¡Hola${app.user.name ? ' ' + app.user.name : ''}! ⏰\nEste es un recordatorio de que tu turno (*${app.reason}*) es en aproximadamente 1 hora, a las *${timeStr} hs*.\n\nPor favor intenta ser puntual. ¡Nos vemos pronto!`;
            
            await WhatsappService.sendMessage(app.user.phone, msg);
            
            await prisma.appointment.update({
              where: { id: app.id },
              data: { hourlyReminderSent: true }
            });
          }
        }
      } catch (error) {
        console.error("Error en recordatorio de 1 hora:", error);
      }
    });
  }
}
