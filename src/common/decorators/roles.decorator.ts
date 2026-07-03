import { SetMetadata } from '@nestjs/common';
import { SchoolAdminRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (SchoolAdminRole | string)[]) =>
  SetMetadata(ROLES_KEY, roles);
