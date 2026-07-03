import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SchoolAdminRole } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      (SchoolAdminRole | string)[]
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      return false;
    }

    // 1. Check direct role (SUPER_ADMIN, etc.)
    const hasDirectRole = requiredRoles.includes(user.role);
    if (hasDirectRole) {
      return true;
    }

    // 2. Check sub-role if it's a SCHOOL_ADMIN
    if (user.role === 'SCHOOL_ADMIN' && user.subRole) {
      const hasSubRole = requiredRoles.includes(user.subRole);
      if (hasSubRole) {
        return true;
      }
    }

    throw new ForbiddenException(
      'You do not have permission to access this resource',
    );
  }
}
