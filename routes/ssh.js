
const express = require('express');
const router = express.Router();
const sshController = require('../controllers/sshController');

// Test SSH connection
router.post('/connect', sshController.testConnection);

// Execute command via SSH
router.post('/execute', sshController.executeCommand);

// Get system information via SSH
router.post('/system-info', sshController.getSystemInfo);

module.exports = router;
