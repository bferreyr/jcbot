import { config } from "dotenv";
config(); // Cargar variables de entorno

import { GoogleSheetsService } from "./src/services/googleSheetsService";

async function test() {
    console.log("==========================================");
    console.log("Prueba de Conexión a Google Sheets");
    console.log("==========================================");
    
    console.log("Credentials Path:", process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH || "❌ NO DEFINIDO");
    console.log("Info Spreadsheet ID:", process.env.GOOGLE_SPREADSHEET_ID || "❌ NO DEFINIDO");
    console.log("Plan Canje ID:", process.env.PLAN_CANJE_SPREADSHEET_ID || "❌ NO DEFINIDO");
    console.log("Reparaciones ID:", process.env.REPARACIONES_SPREADSHEET_ID || "❌ NO DEFINIDO");
    
    console.log("\n--- 1. Probando: Información General del Negocio ---");
    const info = await GoogleSheetsService.getBusinessInfo();
    console.log(info);

    console.log("\n--- 2. Probando: Buscar en Plan Canje ---");
    // Cambia 'iPhone' por algún modelo que sepas que está en la planilla si quieres probar otra cosa
    const canje = await GoogleSheetsService.searchInSheet(process.env.PLAN_CANJE_SPREADSHEET_ID, "iPhone");
    console.log(canje);
    
    console.log("\n--- 3. Probando: Buscar en Reparaciones ---");
    const reparacion = await GoogleSheetsService.searchInSheet(process.env.REPARACIONES_SPREADSHEET_ID, "123");
    console.log(reparacion);

    console.log("\n==========================================");
}

test();
