const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const loanController = require('../controllers/loan.controller');
const paymentController = require('../controllers/payment.controller');
const commissionController = require('../controllers/commission.controller');
const notificationController = require('../controllers/notification.controller');
const referralController = require('../controllers/referral.controller');
const collateralController = require('../controllers/collateral.controller');
const analyticsController = require('../controllers/analytics.controller');

// Borrower and Agent only
router.use(authenticate, authorizeRoles('BORROWER', 'AGENT'));

// Stats route
router.get('/stats', analyticsController.getDashboardStats);

// Loan routes
router.post('/loans/apply', loanController.applyLoan);
/** Borrower-focused: amount + duration + description (+ optional disbursement fields) */
router.post('/loan-request', loanController.loanRequest);
router.get('/loans/my', loanController.getMyLoans);
router.put('/loans/:id/accept-terms', loanController.acceptTerms);
router.put('/loans/:id/reject-offer', loanController.rejectOffer);

// Payment routes
router.post('/payments', paymentController.createPayment);
router.put('/payments/:id', paymentController.updatePayment);
router.get('/payments/my', paymentController.getPayments);

// Notification routes
router.get('/notifications/my', notificationController.getMyNotifications);
router.get('/referrals/my', referralController.getReferrals);
router.get('/referrals/stats', referralController.getReferralStats);

// Collateral routes
router.post('/collateral', collateralController.uploadCollateral);
router.get('/collateral/my', collateralController.getMyCollateral);

// Agent specific routes
router.get('/commissions', authorizeRoles('AGENT'), commissionController.getCommissions);

module.exports = router;
