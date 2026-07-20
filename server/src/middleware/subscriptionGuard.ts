import { NextFunction, Request, Response } from 'express';
import { getSubscriptionLimits, normalizeSubscriptionPlan, SubscriptionFeature } from '../config/subscription';
import { ResponseBuilder } from '../shared/ApiResponse';
import { container } from '../shared/Container';
import { usageCounterService } from '../services/UsageCounterService';
import { TenantRole } from '../domain/entities/TenantUser.entity';

const tenantFromRequest = async (req: Request) => {
  if (req.user?.tid) return container.tenantRepository.findById(req.user.tid);
  const slug = typeof req.params.tenantSlug === 'string' ? req.params.tenantSlug : undefined;
  return slug ? container.tenantRepository.findBySlug(slug) : null;
};

export const subscriptionGuard = (feature: SubscriptionFeature) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = await tenantFromRequest(req);
      if (!tenant) return res.status(403).json(ResponseBuilder.error('TENANT_CONTEXT_REQUIRED', 'Tenant context is required'));
      const limits = getSubscriptionLimits(tenant.subscriptionPlan);
      if (!limits.features[feature]) {
        return res.status(403).json(ResponseBuilder.error(
          'SUBSCRIPTION_FEATURE_REQUIRED',
          `${feature} is not available on the ${normalizeSubscriptionPlan(tenant.subscriptionPlan)} plan`,
          { feature, plan: normalizeSubscriptionPlan(tenant.subscriptionPlan) },
        ));
      }
      next();
    } catch (error) {
      next(error);
    }
  };

export const enforceVisitLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.tid) return res.status(403).json(ResponseBuilder.error('TENANT_CONTEXT_REQUIRED', 'Tenant context is required'));
    await usageCounterService.assertCanCreateVisit(req.user.tid);
    next();
  } catch (error: any) {
    if (error?.statusCode === 403) {
      return res.status(403).json(ResponseBuilder.error(error.code, error.message, error.details));
    }
    next(error);
  }
};

export const enforceCheckInLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.tid) return res.status(403).json(ResponseBuilder.error('TENANT_CONTEXT_REQUIRED', 'Tenant context is required'));
    await usageCounterService.assertCanCreateVisit(req.user.tid);
    const cedula = typeof req.body?.visitorCedula === 'string' ? req.body.visitorCedula : undefined;
    if (cedula) {
      const exists = await container.visitorRepository.exists(req.user.tid, cedula);
      if (!exists) await usageCounterService.assertCanCreateVisitor(req.user.tid);
    }
    next();
  } catch (error: any) {
    if (error?.statusCode === 403) {
      return res.status(403).json(ResponseBuilder.error(error.code, error.message, error.details));
    }
    next(error);
  }
};

export const enforceUserLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.tid) return res.status(403).json(ResponseBuilder.error('TENANT_CONTEXT_REQUIRED', 'Tenant context is required'));
    const role = req.body?.role as TenantRole | undefined;
    if (!role) return res.status(400).json(ResponseBuilder.error('ROLE_REQUIRED', 'Tenant role is required'));
    await usageCounterService.assertCanCreateUser(req.user.tid, role);
    next();
  } catch (error: any) {
    if (error?.statusCode === 403) {
      return res.status(403).json(ResponseBuilder.error(error.code, error.message, error.details));
    }
    next(error);
  }
};

export const enforceVisitorLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.tid) return res.status(403).json(ResponseBuilder.error('TENANT_CONTEXT_REQUIRED', 'Tenant context is required'));
    await usageCounterService.assertCanCreateVisitor(req.user.tid);
    next();
  } catch (error: any) {
    if (error?.statusCode === 403) {
      return res.status(403).json(ResponseBuilder.error(error.code, error.message, error.details));
    }
    next(error);
  }
};
