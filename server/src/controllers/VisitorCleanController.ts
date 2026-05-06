import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import { SequelizeVisitorRepository } from '../infrastructure/database/repositories/SequelizeVisitorRepository';
import logger from '../config/logger';

const visitorRepo = new SequelizeVisitorRepository();

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
    const visitorData = req.body;

    const useCase = container.updateVisitorUseCase;
    const updatedVisitor = await useCase.execute(cedula, visitorData);

    res.json(ResponseBuilder.success(updatedVisitor));
  } catch (error: any) {
    logger.error('Update visitor error:', error);
    if (error.message === 'Visitor not found') {
      return res.status(404).json(ResponseBuilder.error('VISITOR_NOT_FOUND', error.message));
    }
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error updating visitor'));
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
