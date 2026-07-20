import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import { getClientInfo } from '../middleware/ipCapture';
import logger from '../config/logger';

const getActor = (req: Request) => {
  return {
    id: req.user?.id ?? 0,
    username: req.user?.username ?? 'system'
  };
};

const requireTenantId = (req: Request): number => {
  if (!req.tenantId) throw new Error('Tenant context is required');
  return req.tenantId;
};

const getSingleParam = (value: string | string[]): string => Array.isArray(value) ? value[0] : value;

/**
 * POST /api/v1/privacy/arco-requests
 */
export const createArcoRequest = async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const clientInfo = getClientInfo(req);
    const useCase = container.createCreateArcoRequestUseCase();
    const result = await useCase.execute(
      requireTenantId(req),
      {
        requestType: req.body.requestType,
        cedula: req.body.cedula,
        requestedByName: req.body.requestedByName,
        contactEmail: req.body.contactEmail,
        reason: req.body.reason,
        requestPayload: req.body.requestPayload
      },
      actor.id,
      actor.username,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.status(201).json(ResponseBuilder.success(result));
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

    const useCase = container.createListArcoRequestsUseCase();
    const result = await useCase.execute(requireTenantId(req), {
      status: status as string | undefined,
      requestType: requestType as string | undefined,
      search: search as string | undefined,
      limit: limitNum,
      offset
    });

    res.json(ResponseBuilder.success(result));
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
    const clientInfo = getClientInfo(req);
    const requestId = parseInt(getSingleParam(req.params.id), 10);

    if (Number.isNaN(requestId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Id de solicitud invalido'));
    }

    const { status, resolutionNotes } = req.body;
    const useCase = container.createUpdateArcoRequestStatusUseCase();
    const result = await useCase.execute(
      requireTenantId(req),
      requestId,
      { status, resolutionNotes },
      actor.id,
      actor.username,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Solicitud ARCO no encontrada'));
    }
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
    const limitRaw = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    const actor = getActor(req);
    const clientInfo = getClientInfo(req);
    const useCase = container.createAccessSubjectDataUseCase();
    const result = await useCase.execute(requireTenantId(req), cedula, limit, actor.id, actor.username, clientInfo.ip, clientInfo.userAgent);

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Titular no encontrado'));
    }
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
    const actor = getActor(req);
    const clientInfo = getClientInfo(req);
    const useCase = container.createRectifySubjectDataUseCase();
    const result = await useCase.execute(
      requireTenantId(req),
      {
        cedula,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        company: req.body.company,
        jobTitle: req.body.jobTitle,
        email: req.body.email,
        phone: req.body.phone
      },
      actor.id,
      actor.username,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Titular no encontrado'));
    }
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
    const cedula = getSingleParam(req.params.cedula);
    const actor = getActor(req);
    const clientInfo = getClientInfo(req);
    const useCase = container.createCancelSubjectDataUseCase();
    const result = await useCase.execute(requireTenantId(req), cedula, actor.id, actor.username, clientInfo.ip, clientInfo.userAgent);

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Titular no encontrado'));
    }
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
    const cedula = getSingleParam(req.params.cedula);
    const actor = getActor(req);
    const clientInfo = getClientInfo(req);
    const useCase = container.createCreateOppositionRequestUseCase();
    const result = await useCase.execute(
      requireTenantId(req),
      {
        cedula,
        requestedByName: req.body.requestedByName,
        contactEmail: req.body.contactEmail,
        reason: req.body.reason
      },
      actor.id,
      actor.username,
      clientInfo.ip,
      clientInfo.userAgent
    );

    res.status(201).json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('ARCO opposition error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'No se pudo registrar la oposicion'));
  }
};
