import { Response } from "express";

export class SSEService {
  private static clients: Response[] = [];

  static addClient(res: Response) {
    this.clients.push(res);
    
    // Remove client when connection closes
    res.on("close", () => {
      this.clients = this.clients.filter(client => client !== res);
    });
  }

  static notifyUpdate() {
    this.clients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify({ type: "update" })}\n\n`);
      } catch (err) {
        console.error("Error writing to SSE client:", err);
      }
    });
  }
}
