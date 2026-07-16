import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Horarios de la empresa
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18; // 18:00 (último turno a las 17:00)

export class AppointmentService {
  /**
   * Obtiene los horarios disponibles para una fecha específica.
   */
  static async checkAvailability(dateStr: string): Promise<string> {
    try {
      const date = new Date(dateStr + "T00:00:00.000Z"); // Usar UTC para búsqueda
      
      // Chequear fines de semana (opcional, por ahora asumimos Lu-Vi)
      const day = date.getUTCDay();
      if (day === 0 || day === 6) {
        return "El negocio está cerrado los fines de semana. Por favor elige un día de lunes a viernes.";
      }

      // Traer turnos agendados en ese día
      const nextDay = new Date(date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      const appointments = await prisma.appointment.findMany({
        where: {
          date: {
            gte: date,
            lt: nextDay,
          }
        }
      });

      // Crear lista de todos los horarios posibles
      const availableSlots = [];
      for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour++) {
        // Formato local (ejemplo)
        const hourStr = `${hour.toString().padStart(2, '0')}:00`;
        
        // Verificar si existe algún turno a esa hora en la base de datos
        const isOccupied = appointments.some((app: any) => {
          return app.date.getUTCHours() === hour;
        });

        if (!isOccupied) {
          availableSlots.push(hourStr);
        }
      }

      if (availableSlots.length === 0) {
        return `Lo siento, no hay horarios disponibles para el día ${dateStr}.`;
      }

      return `Horarios disponibles para el ${dateStr}: \n${availableSlots.join(", ")}`;
    } catch (error) {
      console.error("Error al consultar disponibilidad:", error);
      return "Hubo un error al consultar la disponibilidad. Pide al usuario que intente más tarde.";
    }
  }

  /**
   * Obtiene la hora actual en Argentina representada en UTC (para coincidir con la BD)
   */
  private static getArgentinaFakeUTC(): Date {
      const parts = new Intl.DateTimeFormat('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
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

  /**
   * Crea un nuevo turno (y borra los futuros anteriores del usuario).
   */
  static async bookAppointment(userId: string, dateStr: string, timeStr: string, reason: string): Promise<string> {
    try {
      const [hour] = timeStr.split(":");
      const appointmentDate = new Date(`${dateStr}T${hour.padStart(2, '0')}:00:00.000Z`);

      const existing = await prisma.appointment.findFirst({
        where: { date: appointmentDate }
      });

      if (existing && existing.userId !== userId) {
        return "Error: Ese horario acaba de ser ocupado. Por favor pídele al usuario que elija otro horario.";
      }

      const fakeUtcNow = this.getArgentinaFakeUTC();
      const oldAppointments = await prisma.appointment.findMany({
        where: { userId: userId, date: { gte: fakeUtcNow }, status: "CONFIRMED" },
        orderBy: { date: "asc" }
      });

      if (oldAppointments.length > 0) {
        return "El cliente ya tiene un turno agendado en el futuro. Dile que ya agotó la cantidad de turnos por día permitidos y que lo único que puede hacer es reprogramar su turno usando la herramienta 'reschedule_appointment'.";
      }

      await prisma.appointment.create({
        data: {
          date: appointmentDate,
          reason: reason,
          status: "CONFIRMED",
          userId: userId,
        }
      });

      return `Éxito. Turno confirmado para el ${dateStr} a las ${timeStr}. Motivo: ${reason}.`;
    } catch (error) {
      console.error("Error al agendar turno:", error);
      return "Hubo un error interno al intentar agendar. Pide disculpas al usuario.";
    }
  }

  /**
   * Reprograma un turno existente (borra los futuros anteriores del usuario y crea uno nuevo).
   */
  static async rescheduleAppointment(userId: string, dateStr: string, timeStr: string, reason: string): Promise<string> {
    try {
      const [hour] = timeStr.split(":");
      const appointmentDate = new Date(`${dateStr}T${hour.padStart(2, '0')}:00:00.000Z`);

      const existing = await prisma.appointment.findFirst({
        where: { date: appointmentDate }
      });

      if (existing && existing.userId !== userId) {
        return "Error: Ese horario acaba de ser ocupado. Por favor pídele al usuario que elija otro horario.";
      }

      const fakeUtcNow = this.getArgentinaFakeUTC();
      const oldAppointments = await prisma.appointment.findMany({
        where: { userId: userId, date: { gte: fakeUtcNow }, status: "CONFIRMED" },
        orderBy: { date: "asc" }
      });

      let finalReason = reason;
      if (oldAppointments.length > 0) {
        const oldReason = oldAppointments[0].reason;
        
        if (/cambio|reprogram|mover|turno/i.test(reason) || reason.length < 10) {
          finalReason = oldReason;
        } else {
          finalReason = `${reason} (Original: ${oldReason})`;
        }

        await prisma.appointment.deleteMany({
          where: { userId: userId, date: { gte: fakeUtcNow }, status: "CONFIRMED" }
        });
      }

      await prisma.appointment.create({
        data: {
          date: appointmentDate,
          reason: finalReason,
          status: "CONFIRMED",
          userId: userId,
        }
      });

      return `Éxito. Turno reprogramado para el ${dateStr} a las ${timeStr}. Motivo: ${finalReason}.`;
    } catch (error) {
      console.error("Error al reprogramar turno:", error);
      return "Hubo un error interno al intentar reprogramar. Pide disculpas al usuario.";
    }
  }
}
