import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';

/**
 * Clean Architecture Visitor Controller
 */

export const getVisitor = async (req: Request, res: Response) => {
  try {
    const cedula = req.params.cedula as string;
    const useCase = container.createGetVisitorByCedulaUseCase();
    const visitor = await useCase.execute(cedula);

    if (!visitor) {
      return res.status(404).json(ResponseBuilder.error('VISITOR_NOT_FOUND', 'Visitor not found'));
    }

    res.json(ResponseBuilder.success(visitor));
  } catch (error) {
    console.error('Get visitor error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching visitor'));
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
    console.error('Get companies error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error fetching companies'));
  }
};
