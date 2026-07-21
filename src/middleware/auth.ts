import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "jcbot_super_secret_key_123";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: "No autorizado. Inicie sesión." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // @ts-ignore
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Sesión inválida o expirada." });
    }
};

export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // @ts-ignore
        const userRole = req.user?.role;
        if (!userRole || !roles.includes(userRole)) {
            return res.status(403).json({ error: "Acceso denegado. Permisos insuficientes." });
        }
        next();
    };
};

// Middleware para proteger archivos estáticos (redirección a login.html)
export const requireAuthHtml = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;
    
    // Si no hay token, redirigir a login
    if (!token) {
        return res.redirect('/login.html');
    }

    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        res.clearCookie('token');
        return res.redirect('/login.html');
    }
};
