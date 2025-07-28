const express = require('express');
const router = express.Router();
const GoogleCloudService = require('../services/googleCloudService');

const gcpService = new GoogleCloudService();

// Get all instances
router.get('/instances', async (req, res) => {
  try {
    const instances = await gcpService.listInstances();
    res.json({
      success: true,
      data: instances,
      count: instances.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get single instance
router.get('/instances/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { zone } = req.query;
    
    const instance = await gcpService.getInstance(name, zone);
    res.json({
      success: true,
      data: instance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create new instance
router.post('/instances', async (req, res) => {
  try {
    const config = req.body;
    
    // Validate required fields
    if (!config.name) {
      return res.status(400).json({
        success: false,
        message: 'Instance name is required'
      });
    }

    // Validate instance name format
    const nameRegex = /^[a-z]([-a-z0-9]*[a-z0-9])?$/;
    if (!nameRegex.test(config.name)) {
      return res.status(400).json({
        success: false,
        message: 'Instance name must start with a lowercase letter, followed by lowercase letters, numbers, or hyphens'
      });
    }

    const instance = await gcpService.createInstance(config);
    res.status(201).json({
      success: true,
      data: instance,
      message: 'Instance created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete instance
router.delete('/instances/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { zone } = req.query;
    
    const result = await gcpService.deleteInstance(name, zone);
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Start instance
router.post('/instances/:name/start', async (req, res) => {
  try {
    const { name } = req.params;
    const { zone } = req.query;
    
    const result = await gcpService.startInstance(name, zone);
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Stop instance
router.post('/instances/:name/stop', async (req, res) => {
  try {
    const { name } = req.params;
    const { zone } = req.query;
    
    const result = await gcpService.stopInstance(name, zone);
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get machine types
router.get('/machine-types', async (req, res) => {
  try {
    const { zone } = req.query;
    const machineTypes = await gcpService.getMachineTypes(zone);
    res.json({
      success: true,
      data: machineTypes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get zones
router.get('/zones', async (req, res) => {
  try {
    const zones = await gcpService.getZones();
    res.json({
      success: true,
      data: zones
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get images
router.get('/images', async (req, res) => {
  try {
    const images = await gcpService.getImages();
    res.json({
      success: true,
      data: images
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
