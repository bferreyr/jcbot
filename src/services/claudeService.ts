import Anthropic from "@anthropic-ai/sdk";
import { GoogleSheetsService } from "./googleSheetsService";

export class ClaudeService {
  static async generateResponse(
    messageHistory: { role: "user" | "assistant"; content: string }[],
    currentMessage: string
  ): Promise<string> {
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("Missing ANTHROPIC_API_KEY");
      return "Error: API de Claude no configurada.";
    }

    const anthropic = new Anthropic({ apiKey });
    const businessInfo = await GoogleSheetsService.getBusinessInfo();

    const systemPrompt = `Eres un asistente virtual para atención al cliente por WhatsApp. 
Tu objetivo es ayudar con ventas, soporte técnico, agendar turnos y resolver dudas frecuentes.
Debes mantener un tono formal, amigable y conciso.

Aquí tienes información específica del negocio (Horarios, precios, dirección):
${businessInfo}

Responde siempre basándote en esta información. Si te preguntan algo que no está aquí, indica de manera educada que no tienes esa información o que pronto se contactarán con ellos. No inventes datos. Si te piden agendar un turno, indícales el horario disponible e invítalos a confirmar (por el momento de manera informativa).`;

    const messages = [...messageHistory, { role: "user" as const, content: currentMessage }];

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages,
      });

      const contentBlock = response.content.find(block => block.type === 'text');
      return contentBlock && 'text' in contentBlock ? contentBlock.text : "Lo siento, no pude procesar tu mensaje.";
    } catch (error) {
      console.error("Error con Claude:", error);
      return "Lo siento, estoy teniendo problemas técnicos en este momento. Intenta de nuevo más tarde.";
    }
  }
}
