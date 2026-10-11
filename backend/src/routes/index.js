import { Router } from 'express';

import { router as authRouter } from './auth.js';
import { router as adminRouter } from './admin.js';
import { router as libraryRouter } from './library.js';
import { router as playbackRouter } from './playback.js';
import { router as billingRouter } from './billing.js';
import { router as reviewsRouter } from './reviews.js';
import { router as homeRouter } from './home.js';
import { router as catalogRouter } from './catalog.js';

/**
 * v1 surface. Each router declares its own absolute paths, so ordering only
 * matters where two routers could match the same URL — the more specific
 * prefixes are registered first.
 */
export const router = Router();

router.use('/auth', authRouter);
router.use('/admin', adminRouter);
router.use('/', libraryRouter);
router.use('/', billingRouter);
router.use('/', reviewsRouter);
router.use('/', homeRouter);
router.use('/', catalogRouter);
router.use('/', playbackRouter);
