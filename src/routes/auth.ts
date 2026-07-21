import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "jcbot_super_secret_key_123";

// Iniciar sesión
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Usuario y contraseña requeridos" });
        }

        const admin = await prisma.adminUser.findUnique({
            where: { username }
        });

        if (!admin) {
            return res.status(401).json({ error: "Credenciales incorrectas" });
        }

        const isMatch = await bcrypt.compare(password, admin.passwordHash);

        if (!isMatch) {
            return res.status(401).json({ error: "Credenciales incorrectas" });
        }

        // Generar Token JWT
        const token = jwt.sign(
            { id: admin.id, username: admin.username, role: admin.role },
            JWT_SECRET,
            { expiresIn: "7d" } // Sesión dura 7 días
        );

        // Guardar token en cookie HttpOnly
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ error: "Error del servidor" });
    }
});

// Cerrar sesión
router.post("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
});

// Endpoint temporal/secreto para crear el primer usuario (solo funciona si no hay ninguno)
router.post("/setup", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: "Faltan datos" });
        }

        const count = await prisma.adminUser.count();
        if (count > 0) {
            return res.status(403).json({ error: "Ya existe un administrador. Setup bloqueado." });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newAdmin = await prisma.adminUser.create({
            data: {
                username,
                passwordHash,
                role: "ADMIN"
            }
        });

        res.json({ success: true, message: `Usuario ${newAdmin.username} creado exitosamente.` });
    } catch (error) {
        console.error("Error en setup:", error);
        res.status(500).json({ error: "Error creando administrador" });
    }
});

export default router;
