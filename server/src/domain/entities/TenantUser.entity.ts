export type TenantRole = 'admin' | 'operador' | 'auditor' | 'demo';

export interface TenantUserEntity {
  id?: number;
  userId: number;
  tenantId: number;
  role: TenantRole;
  isActive?: boolean;
}
