import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";

export class UrlController {
    createShortUrl = catchAsync(async(req: Request, res: Response, next: NextFunction) => {
        const {originalUrl} = req.body;
    })
}