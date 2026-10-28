import { Request, Response } from "express";
import { WhatsappService } from "../services/whatsappService";
import { GeminiService } from "../services/geminiService";
import { ConversationService } from "../services/conversationService";

export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === "subscribe" && token === verifyToken) {
      console.log("WEBHOOK VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
};

const processedMessageIds = new Set<string>();
const userProcessingLocks = new Map<string, Promise<void>>();

export const receiveMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;

    if (!body.object) {
      res.sendStatus(404);
      return;
    }

    // Responder 200 OK de inmediato a WhatsApp para evitar que Meta reenvíe el mismo mensaje en bucle
    res.sendStatus(200);

    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const msgId = message.id;
      const from = message.from;

      // 1. Evitar procesar mensajes duplicados reenviados por WhatsApp
      if (msgId) {
        if (processedMessageIds.has(msgId)) {
          return;
        }
        processedMessageIds.add(msgId);
        if (processedMessageIds.size > 1000) {
          const firstKey = processedMessageIds.values().next().value;
          if (firstKey) processedMessageIds.delete(firstKey);
        }
      }

      // 2. Ignorar webhooks viejos (> 2 minutos) que hayan quedado encolados en Meta
      if (message.timestamp) {
        const msgAgeSeconds = Math.floor(Date.now() / 1000) - Number(message.timestamp);
        if (msgAgeSeconds > 120) {
          console.log(`Ignorando mensaje antiguo (${msgAgeSeconds}s) de ${from}`);
          return;
        }
      }

      const contacts = body.entry[0].changes[0].value.contacts;
      const profileName = contacts && contacts[0] && contacts[0].profile ? contacts[0].profile.name : undefined;
      const baseUrl = (process.env.PUBLIC_DOMAIN || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

      // Encolar por usuario para no disparar múltiples llamadas simultáneas a Gemini
      const prevLock = userProcessingLocks.get(from) || Promise.resolve();
      const currentTask = prevLock
        .catch(() => {})
        .then(async () => {
          let msgBody = "";
          if (message.type === "text") {
            msgBody = message.text.body;
          } else if (message.type === "audio") {
            const mediaId = message.audio.id;
            const mediaData = await WhatsappService.downloadMedia(mediaId);
            if (mediaData) {
              const transcribedText = await GeminiService.transcribeAudio(mediaData.buffer, mediaData.mimeType);
              if (transcribedText) {
                msgBody = transcribedText;
                console.log(`Transcribed audio from ${from}: ${msgBody}`);
              } else {
                await WhatsappService.sendMessage(from, "Lo siento, no pude entender el audio. ¿Podrías escribirlo?");
                return;
              }
            } else {
              await WhatsappService.sendMessage(from, "Hubo un error al descargar tu audio. Por favor intenta de nuevo.");
              return;
            }
          } else {
            return;
          }

          console.log(`Received message from ${from} (${profileName || 'Unknown'}): ${msgBody}`);

          const user = await ConversationService.getUser(from, profileName);

          if (msgBody.trim().toLowerCase() === "/reiniciar" || msgBody.trim().toLowerCase() === "/reset") {
            await ConversationService.clearHistory(user.id);
            await WhatsappService.sendMessage(from, "Memoria borrada. He olvidado nuestra conversación anterior. ¿En qué te puedo ayudar?");
            return;
          }

          await ConversationService.addMessage(user.id, "user", msgBody);

          const history = await ConversationService.getHistory(user.id, 10);

          if (user.botPaused) {
            console.log(`Bot paused for ${from}. Not generating auto-reply.`);
            return;
          }

          // Excluimos el mensaje actual porque se enviará como currentMessage
          const mappedHistory = history
            .filter(h => h.content !== msgBody)
            .map(h => ({
              role: h.role as "user" | "assistant",
              content: h.content
            }));

          const reply = await GeminiService.generateResponse(user.id, mappedHistory, msgBody);

          const imageRegex = /\[IMAGE:\s*([^\]]+)\]/g;
          let match;
          const imagesToSend: string[] = [];
          let textReply = reply;

          while ((match = imageRegex.exec(reply)) !== null) {
            let rawUrl = match[1].trim();
            if (rawUrl.startsWith("/")) {
              rawUrl = `${baseUrl}${rawUrl}`;
            }
            if (rawUrl.startsWith("http")) {
              imagesToSend.push(rawUrl);
            }
          }

          textReply = textReply.replace(imageRegex, '').trim();

          for (const imgUrl of imagesToSend) {
            await WhatsappService.sendImage(from, imgUrl);
          }

          if (textReply) {
            await WhatsappService.sendMessage(from, textReply);
          } else if (imagesToSend.length === 0) {
            await WhatsappService.sendMessage(from, reply); // Fallback
          }
          await ConversationService.addMessage(user.id, "assistant", reply);
        })
        .catch((err) => {
          console.error("Error procesando mensaje en segundo plano:", err);
        });

      userProcessingLocks.set(from, currentTask);
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
};
