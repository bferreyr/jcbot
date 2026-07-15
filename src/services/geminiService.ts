import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleSheetsService } from "./googleSheetsService";

export class GeminiService {
  static async generateResponse(
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

Responde siempre basándote en esta información. Si te preguntan algo que no está aquí, indica de manera educada que no tienes esa información o que pronto se contactarán con ellos. No inventes datos. Si te piden agendar un turno, indícales el horario disponible e invítalos a confirmar (por el momento de manera informativa).`;

    try {
      // Usamos gemini-1.5-flash que es el modelo rápido y recomendado por defecto
      const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash",
        systemInstruction: systemPrompt
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
      const responseText = result.response.text();

      return responseText || "Lo siento, no pude procesar tu mensaje.";
    } catch (error) {
      console.error("Error con Gemini:", error);
      return "Lo siento, estoy teniendo problemas técnicos en este momento. Intenta de nuevo más tarde.";
    }
  }
}
