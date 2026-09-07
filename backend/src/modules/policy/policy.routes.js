const express = require('express');

const controller = require('./policy.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../../middleware/authenticate');
const { requireCapability } = require('../../middleware/authorize');
const { singlePdf } = require('../../middleware/upload');
const { CAPABILITIES } = require('../../constants/permissions');
const {
  policyParams,
  versionParams,
  createPolicySchema,
  updatePolicySchema,
  listPoliciesQuery,
  createVersionSchema,
  updateVersionSchema,
  publishVersionSchema,
  acknowledgeSchema,
  acknowledgementsQuery,
  deletePolicySchema,
} = require('./policy.schemas');

const router = express.Router();

// Every route here needs a session, and an account still holding a temporary
// password may not do normal work until it has been changed (US-003).
router.use(authenticate, requirePasswordChanged);

// Routes declare the CAPABILITY they need rather than the role that happens to
// hold it. POLICY_AUTHOR belongs to ADMIN alone in constants/permissions.js,
// so a MANAGER or EMPLOYEE token gets 403 here and the denial is audited -
// which is what NFR-SEC-03 is verified by. Removing the guard from the React
// interface must not grant access.
const requireAuthor = requireCapability(CAPABILITIES.POLICY_AUTHOR);

// --- T2: the policy shell (spec section 8.3, routes 1-4) ---

router.get('/', validate(listPoliciesQuery, 'query'), controller.listPolicies);

router.post('/', requireAuthor, validate(createPolicySchema), controller.createPolicy);

// Audience-checked inside the service: a caller outside the target audience
// gets 403, not a filtered-down version of the record.
router.get('/:id', validate(policyParams, 'params'), controller.getPolicy);

router.patch(
  '/:id',
  requireAuthor,
  validate(policyParams, 'params'),
  validate(updatePolicySchema),
  controller.updatePolicy
);

// Permanent deletion. Archiving is the reversible retirement that keeps the
// evidence (UC-11); this destroys it, so the service refuses unless the caller
// explicitly confirms the loss.
router.delete(
  '/:id',
  requireAuthor,
  validate(policyParams, 'params'),
  validate(deletePolicySchema),
  controller.deletePolicy
);

// --- T3: draft version authoring ---

router.post(
  '/:id/versions',
  requireAuthor,
  validate(policyParams, 'params'),
  validate(createVersionSchema),
  controller.createVersion
);

router.patch(
  '/:id/versions/:vid',
  requireAuthor,
  validate(versionParams, 'params'),
  validate(updateVersionSchema),
  controller.updateVersion
);

router.get('/:id/versions/:vid', validate(versionParams, 'params'), controller.getVersion);

// Deletes one version. A draft goes without ceremony; a version that was
// published takes its acknowledgements with it, so the service refuses unless
// the caller explicitly confirms that loss.
router.delete(
  '/:id/versions/:vid',
  requireAuthor,
  validate(versionParams, 'params'),
  validate(deletePolicySchema),
  controller.deleteVersion
);

// --- T4: publish, supersede the previous version, fan out assignments ---

router.post(
  '/:id/versions/:vid/publish',
  requireAuthor,
  validate(versionParams, 'params'),
  validate(publishVersionSchema),
  controller.publishVersion
);

// --- T6: acknowledge ---
//
// No POLICY_ACKNOWLEDGE capability guard is needed beyond authentication -
// every role holds it. The real gate is inside the service: an assignment for
// this user and this version must exist, which is a check no capability can
// express. There is deliberately no PATCH or DELETE counterpart anywhere in
// the API; an acknowledgement is written once and never touched again.
router.post(
  '/:id/versions/:vid/acknowledge',
  validate(versionParams, 'params'),
  validate(acknowledgeSchema),
  controller.acknowledgeVersion
);

// --- T8: who acknowledged, and who has not (UC-12) ---

router.get(
  '/:id/versions/:vid/acknowledgements',
  requireAuthor,
  validate(versionParams, 'params'),
  validate(acknowledgementsQuery, 'query'),
  controller.listAcknowledgements
);

// --- T9: the signed PDF (US-016) ---
//
// Not in the spec's section 8.3 table, which lists no attachment route at all
// - but section 7.6 carries attachmentUrl and US-016 requires the file, so a
// route has to exist. Shaped after the incidents attachment route in 8.6.
//
// The download is deliberately a normal GET behind `authenticate`, not a
// signed public URL: the file is streamed only to someone the audience check
// passes, and there is no static directory that could serve it otherwise.
router.post(
  '/:id/versions/:vid/attachment',
  requireAuthor,
  validate(versionParams, 'params'),
  singlePdf('policies'),
  controller.attachFile
);

router.get(
  '/:id/versions/:vid/attachment',
  validate(versionParams, 'params'),
  controller.downloadAttachment
);

router.delete(
  '/:id/versions/:vid/attachment',
  requireAuthor,
  validate(versionParams, 'params'),
  controller.removeAttachment
);

module.exports = router;
