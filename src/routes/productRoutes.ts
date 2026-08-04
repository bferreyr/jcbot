import { Router } from "express";
import multer from "multer";
import path from "path";
import { getProducts, createProduct, deleteProduct, publishToInstagram } from "../controllers/productController";
import { requireRole } from "../middleware/auth";

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    // Save to public/uploads
    cb(null, path.join(__dirname, "../../public/uploads"));
  },
  filename: (req: any, file: any, cb: any) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Admin and Dios can manage products
router.get("/products", requireRole(["ADMIN", "DIOS"]), getProducts);
router.post("/products", requireRole(["ADMIN", "DIOS"]), upload.single("image"), createProduct);
router.delete("/products/:id", requireRole(["ADMIN", "DIOS"]), deleteProduct);
router.post("/products/:id/publish", requireRole(["ADMIN", "DIOS"]), publishToInstagram);

export default router;
