import { GoogleGenerativeAI, SchemaType, Tool } from "@google/generative-ai";
import { BotDataService } from "./botDataService";
import { AppointmentService } from "./appointmentService";
import { ConversationService } from "./conversationService";

export class GeminiService {
  private static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Modelos ordenados por disponibilidad de cuota y velocidad (gemini-flash-lite-latest tiene el límite más alto y menor saturación).
   */
  private static getModelCandidates(): string[] {
    return [
      "gemini-flash-lite-latest",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ];
  }

  private static async executeSingleTool(userId: string, call: { name: string; args: any }): Promise<string> {
    const args = call.args || {};
    if (call.name === "check_availability") {
      return await AppointmentService.checkAvailability(String(args.date || ""));
    } else if (call.name === "book_appointment") {
      return await AppointmentService.bookAppointment(
        userId,
        String(args.date || ""),
        String(args.time || ""),
        String(args.reason || "Consulta técnica")
      );
    } else if (call.name === "reschedule_appointment") {
      return await AppointmentService.rescheduleAppointment(
        userId,
        String(args.date || ""),
        String(args.time || ""),
        String(args.reason || "Cambio de turno")
      );
    } else if (call.name === "get_repair_cost") {
      return await BotDataService.searchRepairs(String(args.query || ""));
    } else if (call.name === "get_plan_canje_info") {
      return await BotDataService.searchPlanCanje(String(args.model || ""));
    } else if (call.name === "get_accessory_stock") {
      return await BotDataService.searchProducts(String(args.query || ""));
    } else if (call.name === "update_crm_status") {
      await ConversationService.updateUserCRM(
        userId,
        String(args.status || "LEAD"),
        String(args.intent || "General"),
        String(args.sentiment || "NEUTRAL"),
        Boolean(args.isUrgent)
      );
      return "CRM Actualizado con éxito.";
    } else if (call.name === "log_faq") {
      await ConversationService.logFAQ(String(args.category || "General"), String(args.question || ""));
      return "FAQ registrada con éxito.";
    }
    return "OK";
  }

  private static async processInlineTags(userId: string, rawText: string): Promise<string> {
    let cleanText = rawText;

    // Procesar etiqueta silenciosa [CRM: STATUS|INTENT|SENTIMENT|URGENT]
    const crmRegex = /\[CRM:\s*([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/gi;
    let crmMatch;
    while ((crmMatch = crmRegex.exec(rawText)) !== null) {
      const status = crmMatch[1].trim().toUpperCase() === "CLIENTE" ? "CLIENTE" : "LEAD";
      const intent = crmMatch[2].trim();
      const sentimentRaw = crmMatch[3].trim().toUpperCase();
      const sentiment = ["FELIZ", "NEUTRAL", "FRUSTRADO"].includes(sentimentRaw) ? sentimentRaw : "NEUTRAL";
      const isUrgent = crmMatch[4].trim().toLowerCase() === "true";
      await ConversationService.updateUserCRM(userId, status, intent, sentiment, isUrgent).catch(() => {});
    }
    cleanText = cleanText.replace(crmRegex, "");

    // Procesar etiqueta silenciosa [FAQ: CATEGORIA|PREGUNTA]
    const faqRegex = /\[FAQ:\s*([^|\]]+)\|([^\]]+)\]/gi;
    let faqMatch;
    while ((faqMatch = faqRegex.exec(rawText)) !== null) {
      const category = faqMatch[1].trim();
      const question = faqMatch[2].trim();
      await ConversationService.logFAQ(category, question).catch(() => {});
    }
    cleanText = cleanText.replace(faqRegex, "");

    return cleanText.trim();
  }

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
    const fullBotContext = await BotDataService.getFullBotContext();

    const currentDateStr = new Intl.DateTimeFormat("es-AR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date());

    const systemPrompt = `Eres "JOTA", el asistente virtual de atención al cliente por WhatsApp del negocio.
Tu objetivo es ayudar con ventas, precios de reparaciones, plan canje, stock de accesorios/productos, agendar turnos y resolver dudas frecuentes.
Mantén siempre un tono formal, amable, claro y conciso en español.

IMPORTANTE: Hoy es ${currentDateStr}. Todas las fechas relativas (mañana, la próxima semana, lunes, etc.) deben calcularse a partir de esta fecha.

Aquí tienes TODA la base de datos actualizada en tiempo real del negocio (Información general, Precios de Reparaciones, Plan Canje y Catálogo de Productos/Accesorios):

${fullBotContext}

REGLAS DE RESPUESTA:
1. Responde SIEMPRE basándote únicamente en la información de arriba. SIEMPRE prioriza esta base de datos actual por encima de cualquier precio u horario viejo que figure en mensajes anteriores del historial. Si algo no figura en la base de datos, indica amablemente que no tienes ese dato cargado en este momento o que un asesor humano te confirmará a la brevedad. No inventes precios ni datos.
2. REPARACIONES: Si el cliente consulta por una reparación y en la lista hay varias calidades u opciones para ese modelo (ej: económica, buena, original), detállale todas las opciones disponibles con su precio, tiempo de demora y detalles para que pueda elegir. NUNCA ofrezcas consultar el estado de una reparación en curso.
3. PRODUCTOS Y ACCESORIOS: Si muestras un producto del catálogo que tiene "Imagen: url", incluye SIEMPRE una línea separada con el formato exacto:
[IMAGE: url_de_la_imagen]
4. TURNOS: Solo si el cliente pide consultar horarios de turnos disponibles, agendar una cita o reprogramar un turno, utiliza las herramientas check_availability, book_appointment o reschedule_appointment.
5. ETIQUETAS INTERNAS (ocultas al cliente):
   - Al final de tu respuesta, agrega en una última línea el estado del CRM con este formato exacto:
     [CRM: LEAD_O_CLIENTE|Intención corta|FELIZ_NEUTRAL_O_FRUSTRADO|true_o_false]
   - Si el usuario hizo una pregunta general frecuente (horarios, dirección, medios de pago, garantía), agrega también:
     [FAQ: Categoría|Pregunta resumida]`;

    const appointmentTools: Tool[] = [
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
            description: "Reserva un turno nuevo para el usuario. Falla si el usuario ya tiene un turno.",
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
                reason: { type: SchemaType.STRING, description: "Motivo del turno" },
              },
              required: ["date", "time", "reason"],
            },
          },
        ],
      },
    ];

    try {
      // Limpiar historial de mensajes vacíos o errores anteriores del bot
      let formattedHistory = messageHistory
        .filter((msg) => msg.content && msg.content.trim().length > 0 && !msg.content.includes("estoy teniendo problemas técnicos"))
        .map((msg) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        }));

      while (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

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

      const modelCandidates = this.getModelCandidates();
      let lastError: any = null;

      for (const modelName of modelCandidates) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: systemPrompt,
              tools: appointmentTools,
            });

            const chat = model.startChat({
              history: validHistory.map((m) => ({
                role: m.role,
                parts: [{ text: m.parts[0].text }],
              })),
            });

            let currentResult = await chat.sendMessage(currentMessage);

            // Soportar 1 o múltiples functionCalls en la misma respuesta (evita error 400 Bad Request)
            let rounds = 0;
            while (rounds < 3) {
              const calls = currentResult.response.functionCalls();
              if (!calls || calls.length === 0) break;

              const functionResponses = [];
              for (const call of calls) {
                const apiResponse = await this.executeSingleTool(userId, call);
                functionResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { result: apiResponse },
                  },
                });
              }

              currentResult = await chat.sendMessage(functionResponses);
              rounds++;
            }

            const rawText = currentResult.response.text() || "";
            const cleanedText = await this.processInlineTags(userId, rawText);
            return cleanedText || "Entendido. ¿Puedo ayudarte con algo más?";
          } catch (err: any) {
            lastError = err;
            const status =
              err?.status ||
              (String(err?.message).includes("503")
                ? 503
                : String(err?.message).includes("429")
                ? 429
                : String(err?.message).includes("400")
                ? 400
                : undefined);

            // Si un modelo devuelve 400 por incompatibilidad con tools, responder directamente sin tools
            if (status === 400) {
              try {
                const plainModel = genAI.getGenerativeModel({
                  model: modelName,
                  systemInstruction: systemPrompt,
                });
                const plainChat = plainModel.startChat({
                  history: validHistory.map((m) => ({
                    role: m.role,
                    parts: [{ text: m.parts[0].text }],
                  })),
                });
                const plainRes = await plainChat.sendMessage(currentMessage);
                const rawText = plainRes.response.text() || "";
                const cleanedText = await this.processInlineTags(userId, rawText);
                if (cleanedText) return cleanedText;
              } catch (plainErr: any) {
                console.warn(`Fallback sin tools en ${modelName} también falló:`, plainErr?.status || plainErr?.message);
              }
            }

            if (status === 503 && attempt === 1) {
              console.warn(`Modelo ${modelName} con alta demanda (503). Reintentando en 1.5s...`);
              await this.sleep(1500);
              continue;
            }

            console.warn(`Modelo ${modelName} falló (${status || err?.message}). Intentando siguiente modelo de respaldo...`);
            break;
          }
        }
      }

      throw lastError;
    } catch (error) {
      console.error("Error con Gemini:", error);
      return "Lo siento, estoy teniendo problemas técnicos en este momento. Intenta de nuevo más tarde.";
    }
  }

  static async summarizeChat(history: { role: string; content: string }[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return "Error: API key no configurada.";

    const genAI = new GoogleGenerativeAI(apiKey);
    const chatText = history.map((h) => `${h.role === "user" ? "Cliente" : "Agente/Bot"}: ${h.content}`).join("\n");

    const prompt = `Analiza el siguiente historial de chat entre un cliente y el soporte técnico (Bot/Agente).
Genera un resumen extremadamente conciso (máximo 3-4 líneas) que responda:
1. ¿Cuál es el problema o necesidad principal del cliente?
2. ¿En qué estado quedó la conversación? (Ej: agendó turno, está pendiente de respuesta, etc.)

Historial:
${chatText}

Resumen Breve:`;

    const modelCandidates = this.getModelCandidates();
    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (error) {
        console.warn(`Error resumiendo con ${modelName}, probando siguiente...`);
      }
    }
    return "No se pudo generar el resumen del chat en este momento.";
  }

  static async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY");
      return "";
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const audioData = {
      inlineData: {
        data: audioBuffer.toString("base64"),
        mimeType: mimeType,
      },
    };

    const modelCandidates = this.getModelCandidates();
    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          audioData,
          { text: "Transcribe exactamente el siguiente audio. Responde SOLO con la transcripción literal, sin ningún texto adicional, aclaración o comillas." },
        ]);
        return result.response.text().trim();
      } catch (error) {
        console.warn(`Error transcribiendo audio con ${modelName}, probando siguiente...`);
      }
    }
    return "";
  }
}
