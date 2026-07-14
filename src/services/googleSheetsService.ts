import { google } from "googleapis";

export class GoogleSheetsService {
  private static getAuthClient() {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return auth;
  }

  static async getBusinessInfo(): Promise<string> {
    try {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH || !process.env.GOOGLE_SPREADSHEET_ID) {
         return "No se ha configurado la conexión con Google Sheets.";
      }
      
      const auth = this.getAuthClient();
      const sheets = google.sheets({ version: "v4", auth });
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      // Ejemplo: Hoja llamada 'Info' y datos en A1:B20
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Info!A1:B20",
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return "No hay información de negocio disponible.";
      }

      let infoText = "Información del negocio:\n";
      rows.forEach((row) => {
        infoText += `- ${row[0]}: ${row[1] || ""}\n`;
      });
      return infoText;
    } catch (error) {
      console.error("Error fetching from Google Sheets:", error);
      return "No se pudo obtener información del negocio por un error de conexión.";
    }
  }
}
