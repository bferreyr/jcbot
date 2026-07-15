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

export const receiveMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;

    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from;
        
        let msgBody = "";
        if (message.type === "text") {
           msgBody = message.text.body;
        } else {
           res.sendStatus(200);
           return;
        }

        console.log(`Received message from ${from}: ${msgBody}`);

        const user = await ConversationService.getUser(from);
        await ConversationService.addMessage(user.id, "user", msgBody);

        const history = await ConversationService.getHistory(user.id, 10);
        
        // Excluimos el mensaje actual porque se enviará como currentMessage
        const mappedHistory = history
          .filter(h => h.content !== msgBody)
          .map(h => ({
            role: h.role as "user" | "assistant",
            content: h.content
          }));

        const reply = await GeminiService.generateResponse(user.id, mappedHistory, msgBody);

        await WhatsappService.sendMessage(from, reply);
        await ConversationService.addMessage(user.id, "assistant", reply);
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error("Error processing message:", error);
    res.sendStatus(500);
  }
};
