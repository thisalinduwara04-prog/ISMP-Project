const express = require('express');
const {
  listTraining,
  getTrainingModule,
  createTraining,
  updateTraining,
  deactivateTraining,
  submitQuiz,
} = require('../controllers/trainingController');
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/rbac');
const { validateBody } = require('../middleware/validate');
const { createTrainingSchema, updateTrainingSchema, quizSubmissionSchema } = require('../validators/trainingValidators');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(protect);

router.get('/', listTraining);
router.get('/:id', getTrainingModule);
router.post('/:id/submit', validateBody(quizSubmissionSchema), submitQuiz);

// Admin-only management endpoints.
router.post('/', allowRoles(ROLES.ADMIN), validateBody(createTrainingSchema), createTraining);
router.patch('/:id', allowRoles(ROLES.ADMIN), validateBody(updateTrainingSchema), updateTraining);
router.delete('/:id', allowRoles(ROLES.ADMIN), deactivateTraining);

module.exports = router;
