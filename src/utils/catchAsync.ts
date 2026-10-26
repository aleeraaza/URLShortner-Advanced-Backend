import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRequestHandler<
  P = Request["params"],
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Request["query"],
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction,
) => Promise<unknown>;

export const catchAsync =
  <
    P = Request["params"],
    ResBody = unknown,
    ReqBody = unknown,
    ReqQuery = Request["query"],
  >(
    fn: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery>,
  ): RequestHandler<P, ResBody, ReqBody, ReqQuery> =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
