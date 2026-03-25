import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, TokenExpiredError, JsonWebTokenError } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'TOKEN_MISSING',
        message: 'No token provided, please login',
        redirect: '/login',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'defaultSecret',
      });
      request['user'] = payload;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({
          statusCode: 401,
          code: 'TOKEN_EXPIRED',
          message: 'Your session has expired, please login again',
          redirect: '/login',
        });
      }

      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException({
          statusCode: 401,
          code: 'TOKEN_INVALID',
          message: 'Invalid token, please login again',
          redirect: '/login',
        });
      }

      throw new UnauthorizedException({
        statusCode: 401,
        code: 'AUTH_ERROR',
        message: 'Authentication failed, please login again',
        redirect: '/login',
      });
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}