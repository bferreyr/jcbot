import { GoogleGenerativeAI, SchemaType, Tool } from "@google/generative-ai";
import { GoogleSheetsService } from "./googleSheetsService";
import { AppointmentService } from "./appointmentService";

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

    const systemPrompt = `Eres un asistente virtual para atención al cliente por WhatsApp. 
Tu objetivo es ayudar con ventas, soporte técnico, agendar turnos y resolver dudas frecuentes.
Debes mantener un tono formal, amigable y conciso.

Aquí tienes información específica del negocio (Horarios, precios, dirección):
${businessInfo}

Responde siempre basándote en esta información. Si te preguntan algo que no está aquí, indica de manera educada que no tienes esa información o que pronto se contactarán con ellos. No inventes datos. 
Si el cliente desea agendar un turno, primero verifica la disponibilidad con check_availability y luego utiliza book_appointment para agendarlo, informándole al cliente.`;

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
              description: "Reserva un turno para el usuario.",
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
}
