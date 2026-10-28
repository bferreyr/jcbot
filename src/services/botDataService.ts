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
  private static tablesEnsured = false;

  static async ensureTables(): Promise<void> {
    if (this.tablesEnsured) return;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Repair" (
          "id" TEXT NOT NULL,
          "model" TEXT NOT NULL,
          "part" TEXT NOT NULL,
          "quality" TEXT NOT NULL,
          "price" TEXT NOT NULL,
          "estimatedTime" TEXT NOT NULL,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Repair_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PlanCanje" (
          "id" TEXT NOT NULL,
          "model" TEXT NOT NULL,
          "condition" TEXT NOT NULL,
          "price" TEXT NOT NULL,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PlanCanje_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "BusinessInfo" (
          "id" TEXT NOT NULL,
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "BusinessInfo_pkey" PRIMARY KEY ("id")
        );
      `);
      this.tablesEnsured = true;
    } catch (error) {
      console.error("Error ensuring bot data tables:", error);
    }
  }

  /**
   * Obtiene toda la información general del negocio desde la base de datos.
   */
  static async getBusinessInfo(): Promise<string> {
    try {
      await this.ensureTables();
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
      await this.ensureTables();
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
      await this.ensureTables();
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

  /**
   * Obtiene un resumen completo de toda la base de datos (Info del negocio, Reparaciones, Plan Canje y Productos)
   * para inyectarlo directamente en el contexto y evitar múltiples llamadas innecesarias a la API de Gemini.
   */
  static async getFullBotContext(): Promise<string> {
    try {
      await this.ensureTables();

      const [infoRows, repairs, canjeItems, products] = await Promise.all([
        prisma.businessInfo.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.repair.findMany({ orderBy: [{ model: "asc" }, { part: "asc" }], take: 300 }),
        prisma.planCanje.findMany({ orderBy: { model: "asc" }, take: 200 }),
        prisma.product.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
      ]);

      const sections: string[] = [];

      // 1. Info del negocio
      if (infoRows.length > 0) {
        sections.push(
          "=== INFORMACIÓN GENERAL DEL NEGOCIO ===\n" +
            infoRows.map((r) => `- ${r.key}: ${r.value}`).join("\n")
        );
      } else {
        sections.push("=== INFORMACIÓN GENERAL DEL NEGOCIO ===\n(Sin datos generales cargados aún en el panel)");
      }

      // 2. Reparaciones
      if (repairs.length > 0) {
        sections.push(
          "=== LISTA DE PRECIOS DE REPARACIONES ===\n" +
            repairs
              .map((r) => {
                const notes = r.notes ? ` | Detalles: ${r.notes}` : "";
                return `- Modelo: ${r.model} | Parte: ${r.part} | Calidad/Tipo: ${r.quality} | Precio: ${formatPriceDisplay(r.price)} | Demora: ${r.estimatedTime}${notes}`;
              })
              .join("\n")
        );
      } else {
        sections.push("=== LISTA DE PRECIOS DE REPARACIONES ===\n(No hay reparaciones cargadas actualmente en el panel)");
      }

      // 3. Plan Canje
      if (canjeItems.length > 0) {
        sections.push(
          "=== EQUIPOS Y VALORES DE PLAN CANJE ===\n" +
            canjeItems
              .map((c) => {
                const notes = c.notes ? ` | Notas: ${c.notes}` : "";
                return `- Modelo: ${c.model} | Condición: ${c.condition} | Valor de toma: ${formatPriceDisplay(c.price)}${notes}`;
              })
              .join("\n")
        );
      } else {
        sections.push("=== EQUIPOS Y VALORES DE PLAN CANJE ===\n(No hay equipos cargados en Plan Canje actualmente)");
      }

      // 4. Productos / Accesorios
      const baseDomain = (process.env.PUBLIC_DOMAIN || "").replace(/\/$/, "");
      if (products.length > 0) {
        sections.push(
          "=== CATÁLOGO DE PRODUCTOS Y ACCESORIOS ===\n" +
            products
              .map((p) => {
                let imgUrl = p.imageUrl || "";
                if (imgUrl && imgUrl.startsWith("/") && baseDomain) {
                  imgUrl = `${baseDomain}${imgUrl}`;
                }
                const imgPart = imgUrl ? ` | Imagen: ${imgUrl}` : "";
                return `- Producto: ${p.name} | Descripción: ${p.description} | Precio: $${p.price}${imgPart}`;
              })
              .join("\n")
        );
      } else {
        sections.push("=== CATÁLOGO DE PRODUCTOS Y ACCESORIOS ===\n(No hay productos cargados actualmente)");
      }

      return sections.join("\n\n");
    } catch (error) {
      console.error("Error obteniendo contexto completo del bot:", error);
      return "Error al obtener datos de la base de datos.";
    }
  }
}

