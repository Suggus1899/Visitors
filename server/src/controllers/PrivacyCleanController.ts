import { Request, Response } from 'express';
import { Op } from 'sequelize';
import fs from 'fs/promises';
import path from 'path';
import VisitorModel from '../models/Visitor';
import VisitModel from '../models/Visit';
import ArcoRequest from '../models/ArcoRequest';
import Encryption from '../utils/Encryption';
import config from '../config/AppConfig';
import { ResponseBuilder } from '../shared/ApiResponse';
import { getClientInfo } from '../middleware/ipCapture';
import { logActivity } from '../models/ActivityLog';
import logger from '../config/logger';

interface TokenUser {
  id?: number;
  username?: string;
  role?: string;
}

const getActor = (req: Request): Required<TokenUser> => {
  const user = (req.user || {}) as TokenUser;
  return {
    id: user.id ?? 0,
    username: user.username ?? 'system',
    role: user.role ?? 'unknown'
  };
};

const normalizeCedula = (raw: string): string => raw.trim();
const getSingleParam = (value: string | string[]): string => Array.isArray(value) ? value[0] : value;

const buildVisitorHash = (cedula: string): string => Encryption.hash(normalizeCedula(cedula));

const parseRequestPayload = (payload: string | null): Record<string, unknown> | null => {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const deletePhotoIfExists = async (photoUrl: string | null): Promise<void> => {
  if (!photoUrl) return;

  const normalized = photoUrl.replace(/\\/g, '/');
  const marker = '/data/photos/';
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex === -1) return;

  const relativePhotoPath = normalized.slice(markerIndex + '/data/'.length);
  const absolutePhotoPath = path.join(config.dbPath, relativePhotoPath);

  try {
    await fs.unlink(absolutePhotoPath);
  } catch {
    // Ignore if photo does not exist anymore
  }
};

/**
 * POST /api/v1/privacy/arco-requests
 */
export const createArcoRequest = async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const { requestType, cedula, requestedByName, contactEmail, reason, requestPayload } = req.body;
    const normalizedCedula = normalizeCedula(cedula);

    const requestRecord = await ArcoRequest.create({
      requestType,
      subjectCedulaHash: buildVisitorHash(normalizedCedula),
      subjectCedulaEncrypted: Encryption.encrypt(normalizedCedula),
      requestedByName,
      requestedByUserId: actor.id,
      contactEmail: contactEmail || null,
      reason: reason || null,
      requestPayload: requestPayload ? JSON.stringify(requestPayload) : null,
      status: 'pending'
    });

    const clientInfo = getClientInfo(req);
    await logActivity(
      actor.id,
      actor.username,
      'ARCO_REQUEST_CREATED',
      'ArcoRequest',
      String(requestRecord.id),
      `Tipo: ${requestType}`,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.status(201).json(ResponseBuilder.success({
      id: requestRecord.id,
      status: requestRecord.status,
      requestType: requestRecord.requestType,
      createdAt: requestRecord.createdAt
    }));
  } catch (error) {
    logger.error('Create ARCO request error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo crear la solicitud ARCO'));
  }
};

/**
 * GET /api/v1/privacy/arco-requests
 */
export const listArcoRequests = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', status, requestType, search } = req.query;
    const pageNum = Math.max(parseInt(page as string) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (requestType) where.requestType = requestType;
    if (search && typeof search === 'string') {
      where[Op.or as unknown as string] = [
        { requestedByName: { [Op.like]: `%${search}%` } },
        { contactEmail: { [Op.like]: `%${search}%` } },
        { reason: { [Op.like]: `%${search}%` } }
      ];
    }

    const { rows, count } = await ArcoRequest.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset
    });

    res.json(ResponseBuilder.success({
      requests: rows.map((item) => ({
        id: item.id,
        requestType: item.requestType,
        requestedByName: item.requestedByName,
        contactEmail: item.contactEmail,
        status: item.status,
        reason: item.reason,
        resolutionNotes: item.resolutionNotes,
        createdAt: item.createdAt,
        resolvedAt: item.resolvedAt,
        requestPayload: parseRequestPayload(item.requestPayload)
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum)
      }
    }));
  } catch (error) {
    logger.error('List ARCO requests error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo obtener el listado ARCO'));
  }
};

/**
 * PATCH /api/v1/privacy/arco-requests/:id/status
 */
export const updateArcoRequestStatus = async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const requestId = parseInt(getSingleParam(req.params.id), 10);

    if (Number.isNaN(requestId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Id de solicitud invalido'));
    }

    const arcoRequest = await ArcoRequest.findByPk(requestId);
    if (!arcoRequest) {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Solicitud ARCO no encontrada'));
    }

    const { status, resolutionNotes } = req.body;
    const terminalStatus = status === 'completed' || status === 'rejected';

    await arcoRequest.update({
      status,
      resolutionNotes: resolutionNotes || null,
      resolvedAt: terminalStatus ? new Date() : null
    });

    const clientInfo = getClientInfo(req);
    await logActivity(
      actor.id,
      actor.username,
      'ARCO_REQUEST_STATUS_UPDATED',
      'ArcoRequest',
      String(arcoRequest.id),
      `Nuevo estado: ${status}`,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.json(ResponseBuilder.success({
      id: arcoRequest.id,
      status: arcoRequest.status,
      resolvedAt: arcoRequest.resolvedAt,
      resolutionNotes: arcoRequest.resolutionNotes
    }));
  } catch (error) {
    logger.error('Update ARCO status error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo actualizar el estado de la solicitud ARCO'));
  }
};

/**
 * GET /api/v1/privacy/subjects/:cedula
 * ARCO - Acceso
 */
export const accessSubjectData = async (req: Request, res: Response) => {
  try {
    const cedula = getSingleParam(req.params.cedula);
    const visitorHash = buildVisitorHash(cedula);

    const visitor = await VisitorModel.findByPk(visitorHash);
    if (!visitor) {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Titular no encontrado'));
    }

    const limitRaw = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    const visits = await VisitModel.findAll({
      where: { visitor_cedula: visitorHash },
      order: [['check_in_time', 'DESC']],
      limit
    });

    const actor = getActor(req);
    const clientInfo = getClientInfo(req);
    await logActivity(
      actor.id,
      actor.username,
      'ARCO_ACCESS_EXECUTED',
      'Visitor',
      visitorHash,
      `Consulta de datos personales. Registros: ${visits.length}`,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.json(ResponseBuilder.success({
      visitor: visitor.getDecrypted(),
      visits: visits.map((visit) => ({
        id: visit.id,
        status: visit.status,
        purpose: visit.purpose,
        personToVisit: visit.person_to_visit,
        checkInTime: visit.check_in_time,
        checkOutTime: visit.check_out_time,
        notes: visit.notes
      }))
    }));
  } catch (error) {
    logger.error('ARCO access error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo obtener la informacion del titular'));
  }
};

/**
 * PATCH /api/v1/privacy/subjects/:cedula
 * ARCO - Rectificacion
 */
export const rectifySubjectData = async (req: Request, res: Response) => {
  try {
    const cedula = getSingleParam(req.params.cedula);
    const visitorHash = buildVisitorHash(cedula);
    const visitor = await VisitorModel.findByPk(visitorHash);

    if (!visitor) {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Titular no encontrado'));
    }

    const updates: Record<string, string | null> = {};
    if (req.body.firstName !== undefined) updates.first_name = req.body.firstName;
    if (req.body.lastName !== undefined) updates.last_name = req.body.lastName;
    if (req.body.company !== undefined) updates.company = req.body.company;
    if (req.body.jobTitle !== undefined) updates.job_title = req.body.jobTitle;
    if (req.body.email !== undefined) updates.email = req.body.email;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;

    await visitor.update(updates);

    const actor = getActor(req);
    const clientInfo = getClientInfo(req);
    await logActivity(
      actor.id,
      actor.username,
      'ARCO_RECTIFICATION_EXECUTED',
      'Visitor',
      visitorHash,
      `Campos rectificados: ${Object.keys(updates).join(', ')}`,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.json(ResponseBuilder.success({
      message: 'Datos rectificados correctamente',
      visitor: visitor.getDecrypted()
    }));
  } catch (error) {
    logger.error('ARCO rectification error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo rectificar la informacion del titular'));
  }
};

/**
 * DELETE /api/v1/privacy/subjects/:cedula
 * ARCO - Cancelacion
 */
export const cancelSubjectData = async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const cedula = getSingleParam(req.params.cedula);
    const visitorHash = buildVisitorHash(cedula);
    const visitor = await VisitorModel.findByPk(visitorHash);

    if (!visitor) {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Titular no encontrado'));
    }

    await deletePhotoIfExists(visitor.photo_url);
    await deletePhotoIfExists(visitor.id_photo_url);

    await visitor.update({
      first_name: 'ANONIMO',
      last_name: 'ANONIMO',
      company: 'ANONIMIZADO',
      job_title: null,
      email: null,
      phone: null,
      photo_url: null,
      id_photo_url: null,
      encrypted_cedula: null
    });

    await ArcoRequest.create({
      requestType: 'cancellation',
      subjectCedulaHash: visitorHash,
      subjectCedulaEncrypted: null,
      requestedByName: actor.username,
      requestedByUserId: actor.id,
      reason: 'Cancelacion ejecutada por administrador',
      status: 'completed',
      resolvedAt: new Date()
    });

    const clientInfo = getClientInfo(req);
    await logActivity(
      actor.id,
      actor.username,
      'ARCO_CANCELLATION_EXECUTED',
      'Visitor',
      visitorHash,
      'Datos personales anonimizados y fotos eliminadas',
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.json(ResponseBuilder.success({
      message: 'Datos del titular anonimizados correctamente'
    }));
  } catch (error) {
    logger.error('ARCO cancellation error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo cancelar la informacion del titular'));
  }
};

/**
 * POST /api/v1/privacy/subjects/:cedula/opposition
 * ARCO - Oposicion
 */
export const createOppositionRequest = async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const cedula = getSingleParam(req.params.cedula);
    const normalizedCedula = normalizeCedula(cedula);

    const requestRecord = await ArcoRequest.create({
      requestType: 'opposition',
      subjectCedulaHash: buildVisitorHash(normalizedCedula),
      subjectCedulaEncrypted: Encryption.encrypt(normalizedCedula),
      requestedByName: req.body.requestedByName,
      requestedByUserId: actor.id,
      contactEmail: req.body.contactEmail || null,
      reason: req.body.reason || 'Solicitud de oposicion registrada',
      status: 'pending'
    });

    const clientInfo = getClientInfo(req);
    await logActivity(
      actor.id,
      actor.username,
      'ARCO_OPPOSITION_REQUESTED',
      'ArcoRequest',
      String(requestRecord.id),
      'Solicitud de oposicion creada',
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.status(201).json(ResponseBuilder.success({
      id: requestRecord.id,
      status: requestRecord.status,
      requestType: requestRecord.requestType
    }));
  } catch (error) {
    logger.error('ARCO opposition error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo registrar la oposicion'));
  }
};
