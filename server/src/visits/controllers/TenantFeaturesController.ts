import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { getSubscriptionLimits, normalizeSubscriptionPlan } from '../../config/subscription';
import ActivityLog from '../../models/ActivityLog';
import Visit from '../../models/Visit';
import Visitor from '../../models/Visitor';
import VisitorEditHistory, { PII_EDIT_FIELDS } from '../../models/VisitorEditHistory';
import { ResponseBuilder } from '../../shared/ApiResponse';
import { container } from '../../shared/Container';
import Encryption from '../../utils/Encryption';

const statusColor: Record<string, string> = {
  waiting: '#f59e0b',
  active: '#22c55e',
  intermittent: '#3b82f6',
  completed: '#6b7280',
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * Decrypts an edit-history value for PII fields so auditor-facing views
 * present plaintext. Mirrors SequelizeVisitorEditHistoryRepository.
 */
const decryptEditValue = (field: string, value: string | null): string | null => {
  if (value === null || value === undefined) return null;
  if (!PII_EDIT_FIELDS.has(field)) return value;
  if (!Encryption.isEncrypted(value)) return value;
  try {
    return Encryption.decrypt(value);
  } catch {
    return value;
  }
};

const requireTenantId = (req: Request): number => {
  if (!req.tenantId) throw new Error('Tenant context is required');
  return req.tenantId;
};

export const getSubscription = async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const tenant = await container.tenantRepository.findById(tenantId);
  if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
  const limits = getSubscriptionLimits(tenant.subscriptionPlan);
  const usage = await container.usageCounterService.getUsage(tenantId);
  res.json(ResponseBuilder.success({
    plan: normalizeSubscriptionPlan(tenant.subscriptionPlan),
    status: tenant.status,
    expiresAt: tenant.subscriptionExpiresAt,
    limits,
    usage,
  }));
};

export const getCalendarEvents = async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const start = new Date(String(req.query.start ?? ''));
  const end = new Date(String(req.query.end ?? ''));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return res.status(400).json(ResponseBuilder.error('INVALID_DATE_RANGE', 'start and end must be valid dates and start must be before end'));
  }
  const visits = await Visit.findAll({
    where: { tenantId, check_in_time: { [Op.gte]: start, [Op.lt]: end } },
    include: [{ model: Visitor, required: false }],
    order: [['check_in_time', 'ASC']],
  });
  const events = visits.map(visit => {
    let visitorName = 'Visitor';
    try {
      const decrypted = visit.Visitor?.getDecrypted();
      if (decrypted) visitorName = `${decrypted.first_name ?? ''} ${decrypted.last_name ?? ''}`.trim() || visitorName;
    } catch { /* Keep privacy-safe fallback for malformed legacy ciphertext. */ }
    return {
      id: visit.id,
      title: `${visitorName} - ${visit.person_to_visit}`,
      start: visit.check_in_time,
      end: visit.check_out_time ?? visit.exit_time ?? null,
      allDay: false,
      color: statusColor[visit.status] ?? '#6b7280',
      status: visit.status,
      tenantId: visit.tenantId,
      visitorId: visit.visitor_id,
      purpose: visit.purpose,
      host: visit.host_person ?? visit.person_to_visit,
      department: visit.target_department ?? visit.department,
    };
  });
  res.json(ResponseBuilder.success(events));
};

export const getAuditorEdits = async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = { tenantId };
  const { rows, count } = await VisitorEditHistory.findAndCountAll({ where, limit, offset, order: [['editedAt', 'DESC']] });
  const edits = rows.map(edit => ({
    ...edit.toJSON(),
    oldValue: decryptEditValue(edit.field, edit.oldValue),
    newValue: decryptEditValue(edit.field, edit.newValue),
  }));
  res.json(ResponseBuilder.success({ edits, total: count, limit, offset }));
};

export const getAuditorStats = async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [totalEdits, editsThisMonth, auditEventsToday, distinctEditors] = await Promise.all([
    VisitorEditHistory.count({ where: { tenantId } }),
    VisitorEditHistory.count({ where: { tenantId, editedAt: { [Op.gte]: monthStart } } }),
    ActivityLog.count({ where: { tenantId, createdAt: { [Op.gte]: dayStart } } }),
    VisitorEditHistory.count({ where: { tenantId }, distinct: true, col: 'editedBy' }),
  ]);
  res.json(ResponseBuilder.success({ totalEdits, editsThisMonth, auditEventsToday, distinctEditors }));
};

export const exportAuditorData = async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const [edits, logs] = await Promise.all([
    VisitorEditHistory.findAll({ where: { tenantId }, order: [['editedAt', 'DESC']], limit: 10000 }),
    ActivityLog.findAll({ where: { tenantId }, order: [['createdAt', 'DESC']], limit: 10000 }),
  ]);
  const rows: unknown[][] = [
    ['type', 'id', 'timestamp', 'user', 'action_or_field', 'entity', 'old_value', 'new_value_or_details'],
    ...edits.map(edit => ['visitor_edit', edit.id, edit.editedAt.toISOString(), edit.editedByUsername, edit.field, edit.visitorId, decryptEditValue(edit.field, edit.oldValue), decryptEditValue(edit.field, edit.newValue)]),
    ...logs.map(log => ['activity_log', log.id, log.createdAt.toISOString(), log.username, log.action, `${log.entity}:${log.entityId}`, '', log.details]),
  ];
  const format = req.query.format === 'excel' ? 'excel' : 'csv';
  const delimiter = format === 'excel' ? '\t' : ',';
  const body = rows.map(row => row.map(csvCell).join(delimiter)).join('\n');
  res.setHeader('Content-Type', format === 'excel' ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=tenant-${tenantId}-audit.${format === 'excel' ? 'xls' : 'csv'}`);
  res.send('\uFEFF' + body);
};
