import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import schedulesRouter from "./schedules";
import carterRouter from "./carter";
import kendaraanRouter from "./kendaraan";
import storageRouter from "./storage";
import tebenganRouter from "./tebengan";
import chatRouter from "./chat";
import pushRouter from "./push";
import usersRouter from "./users";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(schedulesRouter);
router.use(carterRouter);
router.use(kendaraanRouter);
router.use(storageRouter);
router.use(tebenganRouter);
router.use(chatRouter);
router.use(pushRouter);
router.use(usersRouter);
router.use(adminRouter);

export default router;
