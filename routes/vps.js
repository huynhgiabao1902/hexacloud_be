
const express = require('express');
const vpsController = require('../controllers/vpsController');
const router = express.Router();

// Get all VPS (both manual and cloud)
router.get('/', vpsController.getAllVPS.bind(vpsController));

// Get single VPS
router.get('/:id', vpsController.getVPS.bind(vpsController));

// Create new cloud VPS
router.post('/cloud', vpsController.createCloudVPS.bind(vpsController));

// Add manual VPS server
router.post('/manual', vpsController.addManualVPS.bind(vpsController));

// Add VPS route (alias for manual) - for frontend compatibility
router.post('/add', vpsController.addManualVPS.bind(vpsController));

// Update VPS
router.put('/:id', vpsController.updateVPS.bind(vpsController));

// Delete VPS
router.delete('/:id', vpsController.deleteVPS.bind(vpsController));

// Cloud VPS operations
router.post('/:id/start', vpsController.startCloudVPS.bind(vpsController));
router.post('/:id/stop', vpsController.stopCloudVPS.bind(vpsController));

// Google Cloud metadata
router.get('/metadata/zones', vpsController.getZones.bind(vpsController));
router.get('/metadata/machine-types', vpsController.getMachineTypes.bind(vpsController));
router.get('/metadata/images', vpsController.getImages.bind(vpsController));

// Test connection
router.get('/test/gcp-connection', vpsController.testGCPConnection.bind(vpsController));

module.exports = router;
