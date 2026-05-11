import express from "express";
import {
  getAllUsers,
  updateUserRole,
  getUserProfile,
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import requireRole from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/", protect, requireRole("admin"), getAllUsers); // admin-only
router.put("/:id/role", protect, requireRole("admin"), updateUserRole); // admin-only
router.get("/me", protect, getUserProfile);

export default router;
