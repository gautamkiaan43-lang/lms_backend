const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/register', authController.register);
router.post('/register/borrower', authController.registerBorrower);
router.post('/register/agent', authController.registerAgent);
router.post('/login', authController.login);
router.post('/quick-login', authController.quickLogin);
router.get('/demo-credentials/:role', authController.getDemoCredentials);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
// Trigger nodemon restart
