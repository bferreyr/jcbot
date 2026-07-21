import { GoogleGenerativeAI, SchemaType, Tool } from "@google/generative-ai";
import { GoogleSheetsService } from "./googleSheetsService";
import { AppointmentService } from "./appointmentService";
import { ConversationService } from "./conversationService";

export class GeminiService {
  static async generateResponse(
    userId: string,
    messageHistory: { role: "user" | "assistant"; content: string }[],
    currentMessage: string
  ): Promise<string> {

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY");
      return "Error: API de Gemini no configurada.";
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const businessInfo = await GoogleSheetsService.getBusinessInfo();

    const currentDateStr = new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());

    const systemPrompt = `Eres "JOTA" un asistente virtual para atención al cliente por WhatsApp. 
Tu objetivo es ayudar con ventas, soporte técnico, agendar turnos y resolver dudas frecuentes.
Debes mantener un tono formal, amigable y conciso.

IMPORTANTE: Hoy es ${currentDateStr}. Todas las fechas relativas (mañana, la próxima semana) o menciones de días/meses deben calcularse a partir de este momento. Nunca asumas un año distinto al actual a menos que el usuario lo indique.

Aquí tienes información específica del negocio (Horarios, precios, dirección):
${businessInfo}

Responde siempre basándote en esta información. Si te preguntan algo que no está aquí, indica de manera educada que no tienes esa información o que pronto se contactarán con ellos. No inventes datos. 
Si el cliente desea agendar un turno, primero verifica la disponibilidad con check_availability y luego utiliza book_appointment para agendarlo, informándole al cliente. Si quiere cambiar o reprogramar su turno, usa reschedule_appointment.
Para consultar el costo o precio de una reparación, utiliza get_repair_cost buscando por el modelo del equipo o el problema. NUNCA le digas al cliente que puede consultar el estado de una reparación en curso (la empresa no ofrece ese seguimiento por este medio).
Para cotizar un equipo usado o plan canje, utiliza get_plan_canje_info buscando por el modelo del equipo.
Para consultar stock de accesorios (fundas, cargadores, blindex, auriculares, etc.), utiliza get_accessory_stock buscando por el accesorio y modelo. IMPORTANTE: Si la información devuelta por get_accessory_stock contiene una URL de imagen, SIEMPRE debes incluir la imagen y mostrar TODOS los resultados (fotos, precios, descripción). Utiliza el formato exacto [IMAGE: url_de_la_imagen] en una línea separada para cada imagen que vayas a enviar.
Para mantener el CRM sincronizado, usa SIEMPRE la herramienta update_crm_status cuando el usuario muestre interés en un producto/servicio, agende un turno, o cuando notes un CAMBIO en su estado de ánimo (sentiment: FELIZ, NEUTRAL, FRUSTRADO) o nivel de urgencia (isUrgent). Si el cliente estaba enojado y ahora está contento, o si ya no tiene urgencia, DEBES usar update_crm_status para reflejar su estado ACTUAL.
Si el usuario hace una pregunta general y recurrente sobre el negocio (ubicación, horarios, métodos de pago, garantías, etc.), DEBES usar la herramienta log_faq para registrarla.`;

    try {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: "check_availability",
              description: "Revisa los horarios de turno disponibles para una fecha.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  date: { type: SchemaType.STRING, description: "Fecha en formato YYYY-MM-DD" },
                },
                required: ["date"],
              },
            },
            {
              name: "book_appointment",
              description: "Reserva un turno nuevo para el usuario. IMPORTANTE: Falla si el usuario ya tiene un turno.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  date: { type: SchemaType.STRING, description: "Fecha en formato YYYY-MM-DD" },
                  time: { type: SchemaType.STRING, description: "Hora en formato HH:mm" },
                  reason: { type: SchemaType.STRING, description: "Motivo del turno" },
                },
                required: ["date", "time", "reason"],
              },
            },
            {
              name: "reschedule_appointment",
              description: "Reprograma un turno existente del usuario a un nuevo horario.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  date: { type: SchemaType.STRING, description: "Nueva Fecha en formato YYYY-MM-DD" },
                  time: { type: SchemaType.STRING, description: "Nueva Hora en formato HH:mm" },
                  reason: { type: SchemaType.STRING, description: "Motivo (si lo cambia, si no poner Cambio de turno)" },
                },
                required: ["date", "time", "reason"],
              },
            },
            {
              name: "get_repair_cost",
              description: "Busca los costos de reparación para un modelo específico. Pasa SOLO el nombre corto del modelo.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  query: { type: SchemaType.STRING, description: "SOLO el modelo del equipo, sin palabras extra (ej: iPhone 13, S22 Ultra). No agregues 'pantalla' ni 'cambio'." },
                },
                required: ["query"],
              },
            },
            {
              name: "get_plan_canje_info",
              description: "Busca la cotización o información de plan canje para un modelo de celular específico.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  model: { type: SchemaType.STRING, description: "SOLO el modelo del equipo (ej: iPhone 13, S23 Ultra). No agregues palabras extra." },
                },
                required: ["model"],
              },
            },
            {
              name: "get_accessory_stock",
              description: "Busca stock, precios y detalles de accesorios (fundas, cargadores, etc.) para un modelo específico.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  query: { type: SchemaType.STRING, description: "El tipo de accesorio y modelo (ej: cargador iPhone 13, funda S23 Ultra)." },
                },
                required: ["query"],
              },
            },
            {
              name: "update_crm_status",
              description: "Actualiza el estado, intención, sentimiento y urgencia del usuario en el CRM.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  status: { type: SchemaType.STRING, description: "Estado del cliente: LEAD (prospecto/interesado), CLIENTE (ya compró o agendó turno)" },
                  intent: { type: SchemaType.STRING, description: "Intención de compra o consulta (ej: 'Cambio Pantalla iPhone', 'S22 Ultra', 'Funda')" },
                  sentiment: { type: SchemaType.STRING, description: "Sentimiento del usuario: FELIZ, NEUTRAL o FRUSTRADO" },
                  isUrgent: { type: SchemaType.BOOLEAN, description: "Verdadero si el usuario indica que es urgente o lo necesita ya." }
                },
                required: ["status", "intent", "sentiment", "isUrgent"],
              },
            },
            {
              name: "log_faq",
              description: "Registra una pregunta frecuente del usuario para las métricas del CRM.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  category: { type: SchemaType.STRING, description: "Categoría de la pregunta (ej: 'Horarios', 'Ubicación', 'Garantía', 'Pagos')" },
                  question: { type: SchemaType.STRING, description: "La pregunta exacta o resumida que hizo el usuario." }
                },
                required: ["category", "question"],
              },
            },
          ],
        },
      ];

      // Usamos gemini-1.5-flash que es el modelo rápido y recomendado por defecto
      const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite",
        systemInstruction: systemPrompt,
        tools: tools,
      });

      // Transformar el historial al formato de Gemini
      let formattedHistory = messageHistory.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      }));

      // Gemini requiere que el historial comience siempre con el rol 'user'
      while (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      // Además, no soporta mensajes del mismo rol seguidos. Fusionamos los consecutivos.
      const validHistory: { role: string; parts: { text: string }[] }[] = [];
      for (const msg of formattedHistory) {
        if (validHistory.length === 0) {
          validHistory.push(msg);
        } else {
          const lastMsg = validHistory[validHistory.length - 1];
          if (lastMsg.role === msg.role) {
            lastMsg.parts[0].text += "\n" + msg.parts[0].text;
          } else {
            validHistory.push(msg);
          }
        }
      }

      const chat = model.startChat({
        history: validHistory,
      });

      const result = await chat.sendMessage(currentMessage);
      const call = result.response.functionCalls()?.[0];

      if (call) {
        // Ejecutar la función solicitada por Gemini
        let apiResponse = "";
        const args = call.args as any;

        if (call.name === "check_availability") {
          const date = args.date;
          apiResponse = await AppointmentService.checkAvailability(date as string);
        } else if (call.name === "book_appointment") {
          const { date, time, reason } = args;
          apiResponse = await AppointmentService.bookAppointment(userId, date as string, time as string, reason as string);
        } else if (call.name === "reschedule_appointment") {
          const { date, time, reason } = args;
          apiResponse = await AppointmentService.rescheduleAppointment(userId, date as string, time as string, reason as string);
        } else if (call.name === "get_repair_cost") {
          const query = args.query;
          apiResponse = await GoogleSheetsService.searchInSheet(process.env.REPARACIONES_SPREADSHEET_ID, query as string);
        } else if (call.name === "get_plan_canje_info") {
          const model = args.model;
          apiResponse = await GoogleSheetsService.searchInSheet(process.env.PLAN_CANJE_SPREADSHEET_ID, model as string);
        } else if (call.name === "get_accessory_stock") {
          const query = args.query;
          apiResponse = await GoogleSheetsService.searchInSheet(process.env.ACCESORIOS_SPREADSHEET_ID, query as string);
        } else if (call.name === "update_crm_status") {
          const { status, intent, sentiment, isUrgent } = args;
          await ConversationService.updateUserCRM(userId, status as string, intent as string, sentiment as string, isUrgent as boolean);
          apiResponse = "CRM Actualizado con éxito.";
        } else if (call.name === "log_faq") {
          const { category, question } = args;
          await ConversationService.logFAQ(category as string, question as string);
          apiResponse = "FAQ registrada con éxito.";
        }

        // Devolver el resultado de la función a Gemini para que genere la respuesta final al usuario
        const functionResult = await chat.sendMessage([{
          functionResponse: {
            name: call.name,
            response: { result: apiResponse }
          }
        }]);

        return functionResult.response.text() || "Turno procesado.";
      }

      const responseText = result.response.text();
      return responseText || "Lo siento, no pude procesar tu mensaje.";
    } catch (error) {
      console.error("Error con Gemini:", error);
      return "Lo siento, estoy teniendo problemas técnicos en este momento. Intenta de nuevo más tarde.";
    }
  }

  static async summarizeChat(history: { role: string; content: string }[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return "Error: API key no configurada.";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

    const chatText = history.map(h => `${h.role === 'user' ? 'Cliente' : 'Agente/Bot'}: ${h.content}`).join('\n');
    
    const prompt = `Analiza el siguiente historial de chat entre un cliente y el soporte técnico (Bot/Agente).
Genera un resumen extremadamente conciso (máximo 3-4 líneas) que responda:
1. ¿Cuál es el problema o necesidad principal del cliente?
2. ¿En qué estado quedó la conversación? (Ej: agendó turno, está pendiente de respuesta, etc.)

Historial:
${chatText}

Resumen Breve:`;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Error resumiendo chat:", error);
      return "No se pudo generar el resumen del chat en este momento.";
    }
  }
}
