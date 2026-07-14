import { Router } from "express";
import { verifyWebhook, receiveMessage } from "../controllers/webhookController";

const router = Router();

router.get("/", verifyWebhook);
router.post("/", receiveMessage);

export default router;
