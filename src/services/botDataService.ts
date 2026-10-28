import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STOP_WORDS = new Set([
  "de", "del", "el", "la", "los", "las", "un", "una", "unos", "unas",
  "para", "por", "con", "en", "mi", "tu", "su", "al", "lo", "y", "o",
  "cambio", "cambiar", "reparacion", "reparar", "arreglo", "arreglar",
  "precio", "precios", "costo", "costos", "cuanto", "sale", "cuesta",
  "vale", "celular", "telefono", "equipo", "stock", "tenes", "tienen",
  "hay", "busco", "quiero", "necesito", "cotizar", "plan", "canje"
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractTokens(query: string): string[] {
  const normalized = normalizeText(query);
  const rawTokens = normalized.split(/[\s,.;:!?/\\-]+/).filter(Boolean);
  const filtered = rawTokens.filter(t => !STOP_WORDS.has(t));
  return filtered.length > 0 ? filtered : rawTokens;
}

function formatPriceDisplay(price: string | number): string {
  const str = String(price).trim();
  if (!str) return "Consultar";
  if (str.startsWith("$") || /usd|u\$s|pesos|consultar/i.test(str)) {
    return str;
  }
  return `$${str}`;
}

export class BotDataService {
  /**
   * Obtiene toda la información general del negocio desde la base de datos.
   */
  static async getBusinessInfo(): Promise<string> {
    try {
      const infoRows = await prisma.businessInfo.findMany({
        orderBy: { createdAt: "asc" },
      });

      if (!infoRows || infoRows.length === 0) {
        return "No hay información adicional del negocio cargada actualmente.";
      }

      let infoText = "Información del negocio:\n";
      infoRows.forEach((row) => {
        infoText += `- ${row.key}: ${row.value}\n`;
      });
      return infoText;
    } catch (error) {
      console.error("Error fetching business info from DB:", error);
      return "No se pudo obtener la información general del negocio.";
    }
  }

  /**
   * Busca costos, calidades y demoras de reparaciones en la base de datos.
   */
  static async searchRepairs(query: string): Promise<string> {
    try {
      const allRepairs = await prisma.repair.findMany({
        orderBy: [{ model: "asc" }, { part: "asc" }],
      });

      if (allRepairs.length === 0) {
        return "Actualmente no hay reparaciones cargadas en el sistema.";
      }

      const tokens = extractTokens(query);
      if (tokens.length === 0) {
        return `No se encontraron resultados para "${query}".`;
      }

      // 1. Coincidencia exacta de todos los términos relevantes en (modelo + parte + calidad + notas)
      let matches = allRepairs.filter((r) => {
        const searchable = normalizeText(`${r.model} ${r.part} ${r.quality} ${r.notes || ""}`);
        return tokens.every((token) => searchable.includes(token));
      });

      // 2. Fallback: si el usuario o Gemini incluyó palabras extra (ej. marca o repuesto no listado),
      // buscamos coincidencias por modelo para mostrar todas las reparaciones disponibles de ese equipo.
      if (matches.length === 0) {
        matches = allRepairs.filter((r) => {
          const normModel = normalizeText(r.model);
          return tokens.some((token) => token.length >= 2 && normModel.includes(token));
        });
      }

      if (matches.length === 0) {
        return `No se encontraron reparaciones registradas para "${query}".`;
      }

      const formatted = matches.map((r) => {
        const notesPart = r.notes ? ` | Detalles/Garantía: ${r.notes}` : "";
        return `[Reparación] Modelo: ${r.model} | Parte a reparar: ${r.part} | Tipo/Calidad: ${r.quality} | Precio: ${formatPriceDisplay(r.price)} | Tiempo de demora: ${r.estimatedTime}${notesPart}`;
      });

      return `Resultados encontrados en la base de datos:\n` + formatted.join("\n");
    } catch (error) {
      console.error("Error searching repairs in DB:", error);
      return "Hubo un error al consultar los precios de reparaciones.";
    }
  }

  /**
   * Busca información de Plan Canje en la base de datos.
   */
  static async searchPlanCanje(query: string): Promise<string> {
    try {
      const allCanje = await prisma.planCanje.findMany({
        orderBy: { model: "asc" },
      });

      if (allCanje.length === 0) {
        return "Actualmente no hay equipos cargados en la lista de Plan Canje.";
      }

      const tokens = extractTokens(query);
      if (tokens.length === 0) {
        return `No se encontraron resultados de Plan Canje para "${query}".`;
      }

      let matches = allCanje.filter((c) => {
        const searchable = normalizeText(`${c.model} ${c.condition} ${c.notes || ""}`);
        return tokens.every((token) => searchable.includes(token));
      });

      if (matches.length === 0) {
        matches = allCanje.filter((c) => {
          const normModel = normalizeText(c.model);
          return tokens.some((token) => token.length >= 2 && normModel.includes(token));
        });
      }

      if (matches.length === 0) {
        return `No se encontró cotización de Plan Canje para "${query}".`;
      }

      const formatted = matches.map((c) => {
        const notesPart = c.notes ? ` | Detalles: ${c.notes}` : "";
        return `[Plan Canje] Modelo: ${c.model} | Condición/Requisitos: ${c.condition} | Valor de toma: ${formatPriceDisplay(c.price)}${notesPart}`;
      });

      return `Resultados encontrados en Plan Canje:\n` + formatted.join("\n");
    } catch (error) {
      console.error("Error searching Plan Canje in DB:", error);
      return "Hubo un error al consultar la información de Plan Canje.";
    }
  }

  /**
   * Busca productos y accesorios en la tabla Product de la base de datos.
   */
  static async searchProducts(query: string): Promise<string> {
    try {
      const allProducts = await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
      });

      if (allProducts.length === 0) {
        return "Actualmente no hay productos ni accesorios cargados en el catálogo.";
      }

      const tokens = extractTokens(query);

      let matches = allProducts.filter((p) => {
        const searchable = normalizeText(`${p.name} ${p.description}`);
        return tokens.every((token) => searchable.includes(token));
      });

      if (matches.length === 0 && tokens.length > 0) {
        matches = allProducts.filter((p) => {
          const searchable = normalizeText(`${p.name} ${p.description}`);
          return tokens.some((token) => token.length >= 2 && searchable.includes(token));
        });
      }

      if (matches.length === 0) {
        return `No se encontraron productos o accesorios para "${query}".`;
      }

      const baseDomain = (process.env.PUBLIC_DOMAIN || "").replace(/\/$/, "");

      const formatted = matches.map((p) => {
        let imgUrl = p.imageUrl || "";
        if (imgUrl && imgUrl.startsWith("/") && baseDomain) {
          imgUrl = `${baseDomain}${imgUrl}`;
        }
        const imgPart = imgUrl ? ` | Imagen: ${imgUrl}` : "";
        return `[Producto/Accesorio] Nombre: ${p.name} | Descripción: ${p.description} | Precio: $${p.price}${imgPart}`;
      });

      return `Resultados encontrados en catálogo:\n` + formatted.join("\n");
    } catch (error) {
      console.error("Error searching products in DB:", error);
      return "Hubo un error al buscar en el catálogo de productos.";
    }
  }
}

