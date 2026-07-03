import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const key = req.headers['x-idempotency-key'] as string;

    if (!key) {
      return next();
    }

    const existingResponse = await (this.prisma as any).idempotency.findUnique({
      where: { key },
    });

    if (existingResponse) {
      return res
        .status(existingResponse.statusCode)
        .json(existingResponse.response);
    }

    // Wrap res.json to capture and save the response for this key
    const originalJson = res.json;
    res.json = (body: any) => {
      //  caching successful responses (200, 201)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        (this.prisma as any).idempotency
          .create({
            data: {
              key,
              response: body,
              statusCode: res.statusCode,
            },
          })
          .catch((err) =>
            console.error('Failed to save idempotency response', err),
          );
      }
      return originalJson.call(res, body);
    };

    next();
  }
}
