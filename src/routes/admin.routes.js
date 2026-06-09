const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const userController = require('../controllers/user.controller');
const loanController = require('../controllers/loan.controller');
const paymentController = require('../controllers/payment.controller');
const auditController = require('../controllers/audit.controller');
const collateralController = require('../controllers/collateral.controller');
const analyticsController = require('../controllers/analytics.controller');
const commissionController = require('../controllers/commission.controller');
const notificationController = require('../controllers/notification.controller');
const settingsController = require('../controllers/settings.controller');
const payoutController = require('../controllers/payout.controller');
const upload = require('../middleware/upload.middleware');


// Admin only
router.use(authenticate, authorizeRoles('ADMIN'));

// Dashboard Stats
router.get('/stats', analyticsController.getDashboardStats);

// Manage Users
router.get('/users', userController.getAllUsers);
router.post('/users', upload.any(), userController.createUser);
router.put('/users/:id', upload.any(), userController.updateUser);

router.put('/users/:id/approve', userController.approveUser);
router.delete('/users/:id', userController.deleteUser);

// Approve Loans
// Loan Flow
router.get('/loans', loanController.getLoans);
router.post('/loans', loanController.applyLoan);
router.put('/loans/:id/set-terms', loanController.setTerms);
router.put('/loans/:id/confirm-funds', loanController.confirmFunds);
router.put('/loans/:id/reject', loanController.rejectLoan);
router.put('/loans/:id/interest', loanController.updateInterest);
router.delete('/loans/:id', loanController.deleteLoan);
// View all payments
router.get('/payments', paymentController.getPayments);
router.get('/payments/upcoming', paymentController.getUpcomingPayments);
router.get('/payments/paid', paymentController.getPaidPayments);
router.get('/payments/late', paymentController.getLatePayments);
router.get('/payments/export', paymentController.exportPayments);
router.put('/payments/:id/verify', paymentController.verifyPayment);

// Audit Logs
router.get('/audit', auditController.getAuditLogs);



// Notifications
router.get('/notifications', notificationController.getNotifications);

// Settings
router.get('/config', settingsController.getSettings);
router.put('/config', settingsController.updateSettings);
router.post('/config/reset', settingsController.resetSystem);

// Collateral Management
router.get('/collateral', collateralController.getAllCollateral);
router.patch('/collateral/:id/verify', collateralController.verifyCollateral);



module.exports = router;
