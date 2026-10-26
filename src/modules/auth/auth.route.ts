import { Router } from "express";
import { authenticate } from "../../middlewares/authentication.middleware.js";
import { authorize } from "../../middlewares/authorization.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import type { AuthController } from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.schema.js";

export const createAuthRouter = (controller: AuthController) => {
  const router = Router();

  router.post("/register", validate(registerSchema), controller.register);
  router.post("/login", validate(loginSchema), controller.login);
  router.get("/me", authenticate, authorize("USER"), controller.me);
  router.post("/refresh-token", controller.refresh);
  router.post("/logout", authenticate, authorize("USER"), controller.logout);
  router.post(
    "/logout-alldevices",
    authenticate,
    authorize("USER"),
    controller.logoutAll,
  );

  return router;
};
