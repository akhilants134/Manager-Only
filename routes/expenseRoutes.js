import express from "express";
import {
  getAllExpenses,
  getMyExpenses,
  createExpense,
  updateExpense,
  approveExpense,
  rejectExpense,
  deleteExpense,
} from "../controllers/expenseController.js";
import { protect } from "../middleware/authMiddleware.js";
import requireRole from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/", protect, requireRole("manager", "admin"), getAllExpenses); // restricted to manager/admin
router.get("/mine", protect, getMyExpenses);
router.post("/", protect, createExpense);
router.put("/:id", protect, updateExpense);
router.put(
  "/:id/approve",
  protect,
  requireRole("manager", "admin"),
  approveExpense,
);
router.put(
  "/:id/reject",
  protect,
  requireRole("manager", "admin"),
  rejectExpense,
);
router.delete("/:id", protect, requireRole("admin"), deleteExpense);

export default router;
