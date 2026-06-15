import { Router, Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analyticsService';

export const analyticsRouter = Router();

// GET /api/v1/analytics — Full analytics dashboard data
analyticsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getAnalytics();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/prediction-metrics — Per-type prediction model data
analyticsRouter.get('/prediction-metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await analyticsService.getPredictionMetrics();
    res.json({ metrics });
  } catch (err) {
    next(err);
  }
});
