import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import config from '../config/AppConfig';
import logger from '../config/logger';

const visitorRepo = container.visitorRepository;

/**
 * Clean Architecture Visitor Controller
 */

export const getVisitor = async (req: Request, res: Response) => {
  try {
    const cedula = req.params.cedula as string;
    const includeHistory = req.query.history === 'true';
    const useCase = container.createGetVisitorByCedulaUseCase();
    const visitor = await useCase.execute(cedula, includeHistory);

    if (!visitor) {
      return res.status(404).json(ResponseBuilder.error('VISITOR_NOT_FOUND', 'Visitor not found'));
    }

    // Map to snake_case for frontend compatibility
    const response = {
      cedula: visitor.cedula,
      first_name: visitor.firstName,
      last_name: visitor.lastName,
      company: visitor.company,
      job_title: visitor.jobTitle,
      photo_url: visitor.photoUrl,
      email: visitor.email,
      phone: visitor.phone,
    };

    res.json(ResponseBuilder.success(response));
  } catch (error) {
    logger.error('Get visitor error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching visitor'));
  }
};

export const getAllVisitors = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const company = req.query.company as string | undefined;

    const useCase = container.getAllVisitorsUseCase;
    const result = await useCase.execute({ page, limit, company });

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Get all visitors error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching visitors'));
  }
};

export const updateVisitor = async (req: Request, res: Response) => {
  try {
    const cedula = req.params.cedula as string;
    const { photoBase64, idPhotoBase64, photoUrl, idPhotoUrl, visitId, ...rest } = req.body;

    // Normalize snake_case fields from frontend to camelCase for DTO
    const firstName = rest.firstName || rest.first_name;
    const lastName = rest.lastName || rest.last_name;
    const jobTitle = rest.jobTitle || rest.job_title;

    // Convert base64 photos to Buffer if provided
    let photoBlob: Buffer | undefined;
    let idPhotoBlob: Buffer | undefined;

    if (photoBase64 && typeof photoBase64 === 'string' && photoBase64.startsWith('data:')) {
      const clean = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      photoBlob = Buffer.from(clean, 'base64');
    }

    if (idPhotoBase64 && typeof idPhotoBase64 === 'string' && idPhotoBase64.startsWith('data:')) {
      const clean = idPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
      idPhotoBlob = Buffer.from(clean, 'base64');
    }

    const visitorData = { ...rest, firstName, lastName, jobTitle, photoBlob, idPhotoBlob };

    // Build edit context if visitId is provided (for audit trail)
    // visitId=0 means editing from visitor profile (no specific visit) — still log with visitId=0
    const editContext = (visitId !== undefined && req.user)
      ? { visitId: Number(visitId), editedBy: req.user.id, editedByUsername: req.user.username }
      : undefined;

    const useCase = container.updateVisitorUseCase;
    const updatedVisitor = await useCase.execute(cedula, visitorData, editContext);

    res.json(ResponseBuilder.success(updatedVisitor));
  } catch (error: any) {
    logger.error('Update visitor error:', error);
    if (error.message === 'Visitor not found') {
      return res.status(404).json(ResponseBuilder.error('VISITOR_NOT_FOUND', error.message));
    }
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error updating visitor'));
  }
};

/**
 * Verify the edit protection password.
 * Compares the provided password against the EDIT_PASSWORD env var.
 */
export const verifyEditPassword = async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json(ResponseBuilder.error('VALIDATION_ERROR', 'Password is required'));
    }

    const storedPassword = config.editPassword;
    if (!storedPassword) {
      return res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Edit password not configured'));
    }

    // If stored password is a bcrypt hash (starts with $2), use bcrypt.compare
    // Otherwise do a direct comparison (for plaintext env values)
    let valid: boolean;
    if (storedPassword.startsWith('$2')) {
      valid = await bcrypt.compare(password, storedPassword);
    } else {
      valid = password === storedPassword;
    }

    res.json(ResponseBuilder.success({ valid }));
  } catch (error) {
    logger.error('Verify edit password error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error verifying password'));
  }
};

/**
 * Get edit history for a specific visit.
 */
export const getEditHistory = async (req: Request, res: Response) => {
  try {
    const visitId = parseInt(String(req.params.visitId), 10);
    if (isNaN(visitId)) {
      return res.status(400).json(ResponseBuilder.error('VALIDATION_ERROR', 'Invalid visit ID'));
    }

    // If visitId is 0, return empty (no visit context)
    if (visitId === 0) {
      res.json(ResponseBuilder.success([]));
      return;
    }

    const history = await container.visitorEditHistoryRepository.findByVisitId(visitId);
    res.json(ResponseBuilder.success(history));
  } catch (error) {
    logger.error('Get edit history error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching edit history'));
  }
};

/**
 * Get edit history for a specific visitor (by cedula).
 */
export const getEditHistoryByCedula = async (req: Request, res: Response) => {
  try {
    const cedula = String(req.params.cedula);
    const visitor = await visitorRepo.findByCedula(cedula);
    if (!visitor || !visitor.id) {
      res.json(ResponseBuilder.success([]));
      return;
    }

    const history = await container.visitorEditHistoryRepository.findByVisitorId(visitor.id);
    res.json(ResponseBuilder.success(history));
  } catch (error) {
    logger.error('Get edit history by cedula error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching edit history'));
  }
};

export const getCompanies = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    const query = typeof q === 'string' ? q : '';
    const useCase = container.createGetCompaniesUseCase();
    const companies = await useCase.execute(query);
    res.json(ResponseBuilder.success(companies));
  } catch (error) {
    logger.error('Get companies error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching companies'));
  }
};

export const getVisitorPhoto = async (req: Request, res: Response) => {
  try {
    const cedula = String(req.params.cedula);
    const blob = await visitorRepo.getPhotoBlob(cedula);

    if (!blob) {
      return res.status(404).json(ResponseBuilder.error('PHOTO_NOT_FOUND', 'Photo not found'));
    }

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(blob);
  } catch (error) {
    logger.error('Get visitor photo error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching photo'));
  }
};

export const getVisitorIdPhoto = async (req: Request, res: Response) => {
  try {
    const cedula = String(req.params.cedula);
    const blob = await visitorRepo.getIdPhotoBlob(cedula);

    if (!blob) {
      return res.status(404).json(ResponseBuilder.error('PHOTO_NOT_FOUND', 'ID photo not found'));
    }

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(blob);
  } catch (error) {
    logger.error('Get visitor ID photo error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching ID photo'));
  }
};
