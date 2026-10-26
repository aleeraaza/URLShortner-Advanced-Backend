import { AuthController } from "./auth.controller.js";
import { PrismaAuthRepository } from "./auth.repository.js";
import { createAuthRouter } from "./auth.route.js";
import { AuthService } from "./auth.service.js";

const repository = new PrismaAuthRepository();
const service = new AuthService(repository);
const controller = new AuthController(service);

export const authRouter = createAuthRouter(controller);
