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

  /**
   * Busca un término en TODAS las pestañas de una planilla.
   * Útil para buscar estados de reparación o precios de plan canje sin importar el nombre de la hoja.
   * @param spreadsheetId El ID de la planilla
   * @param query El término de búsqueda (ej: DNI o Modelo)
   */
  static async searchInSheet(spreadsheetId: string | undefined, query: string): Promise<string> {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH || !spreadsheetId) {
      return "Error: La planilla no está configurada.";
    }
    
    try {
      const auth = this.getAuthClient();
      const sheets = google.sheets({ version: "v4", auth });
      
      // 1. Obtener la metadata para saber qué hojas (pestañas) existen
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      if (!meta.data.sheets || meta.data.sheets.length === 0) {
        return "La planilla no tiene hojas.";
      }
      
      // Extraer los nombres de todas las hojas
      const sheetNames = meta.data.sheets.map(s => s.properties?.title).filter(title => title) as string[];
      
      // 2. Obtener los datos de todas las hojas de una sola vez
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: sheetNames,
      });

      const valueRanges = response.data.valueRanges;
      if (!valueRanges || valueRanges.length === 0) {
        return "La planilla está vacía.";
      }

      const results = [];
      const lowerQuery = query.toLowerCase().trim();
      const queryTerms = lowerQuery.split(/\s+/); // Separar la búsqueda en palabras

      // 3. Buscar en cada pestaña
      for (let v = 0; v < valueRanges.length; v++) {
        const rows = valueRanges[v].values;
        if (!rows || rows.length === 0) continue;
        
        const sheetName = sheetNames[v];
        // Asumimos que la fila 0 de cada pestaña tiene los encabezados
        const headers = rows[0];

        // Buscar a partir de la fila 1 (ignorando encabezados)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          
          // Unir toda la fila en un solo texto para buscar las palabras en cualquier columna
          const rowText = row.join(" ").toLowerCase();

          // Revisar si TODAS las palabras de la búsqueda están en alguna parte de esta fila
          const matches = queryTerms.every(term => rowText.includes(term));
          
          if (matches) {
            // Formatear la fila encontrada con sus encabezados
            const formattedRow = row.map((cell, index) => {
              const header = headers[index] || `Columna ${index + 1}`;
              return `${header}: ${cell}`;
            }).join(" | ");
            
            results.push(`[${sheetName}] ${formattedRow}`);
          }
        }
      }

      if (results.length === 0) {
        return `No se encontraron resultados para "${query}" en ninguna pestaña.`;
      }

      return `Resultados encontrados:\n` + results.join("\n");
    } catch (error) {
      console.error("Error searching in Google Sheets:", error);
      return "Hubo un error de conexión al buscar en la planilla.";
    }
  }
}
