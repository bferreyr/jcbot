export class WhatsappService {
  static async sendMessage(to: string, body: string): Promise<void> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    if (!token || !phoneNumberId) {
      console.error("Missing WhatsApp credentials");
      return;
    }

    const apiUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      });
      if (!response.ok) {
         const errText = await response.text();
         console.error("Failed to send WA message:", errText);
      }
    } catch (error) {
      console.error("Error sending WhatsApp message:", error);
    }
  }

  static async sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    if (!token || !phoneNumberId) {
      console.error("Missing WhatsApp credentials");
      return;
    }

    const apiUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    try {
      const payload: any = {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl },
      };

      if (caption) {
        payload.image.caption = caption;
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
         const errText = await response.text();
         console.error("Failed to send WA image:", errText);
      }
    } catch (error) {
      console.error("Error sending WhatsApp image:", error);
    }
  }

  static async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const token = process.env.WHATSAPP_TOKEN;
    
    if (!token) {
      console.error("Missing WhatsApp credentials");
      return null;
    }

    try {
      // 1. Get media URL
      const urlResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!urlResponse.ok) {
        console.error("Failed to get media URL:", await urlResponse.text());
        return null;
      }

      const mediaData = await urlResponse.json();
      const mediaUrl = mediaData.url;
      const mimeType = mediaData.mime_type;

      // 2. Download actual media file
      const downloadResponse = await fetch(mediaUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!downloadResponse.ok) {
        console.error("Failed to download media file:", await downloadResponse.text());
        return null;
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return { buffer, mimeType };
    } catch (error) {
      console.error("Error downloading media:", error);
      return null;
    }
  }
}
