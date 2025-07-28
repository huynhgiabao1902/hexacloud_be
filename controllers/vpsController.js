
const GoogleCloudService = require('../services/googleCloudService');
const fs = require('fs').promises;
const path = require('path');

class VPSController {
  constructor() {
    this.googleCloud = new GoogleCloudService();
    this.dataDir = process.env.DATA_DIR || './data';
    this.vpsDbFile = path.join(this.dataDir, process.env.VPS_DB_FILE || 'vps-database.json');
  }

  // Initialize data directory
  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Error creating data directory:', error);
    }
  }

  // Load VPS database
  async loadVPSDatabase() {
    try {
      await this.ensureDataDir();
      const data = await fs.readFile(this.vpsDbFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { servers: [], cloudInstances: [] };
      }
      throw error;
    }
  }

  // Save VPS database
  async saveVPSDatabase(database) {
    try {
      await this.ensureDataDir();
      await fs.writeFile(this.vpsDbFile, JSON.stringify(database, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving VPS database:', error);
      throw error;
    }
  }

  // Map osImage to sourceImage - CẬP NHẬT THEO DANH SÁCH GCP THỰC TẾ
  mapOsImageToSourceImage(osImage) {
    const imageMap = {
      // Ubuntu LTS versions có sẵn trên GCP
      'ubuntu-2204-lts': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts',
      'ubuntu-2404-lts': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64',

      // Alternative names
      'ubuntu-22.04': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts',
      'ubuntu-24.04': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64',
      'ubuntu': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts',

      // Minimal versions
      'ubuntu-minimal-2204': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-2204-lts',
      'ubuntu-minimal-2404': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-minimal-2404-lts-amd64',

      // Pro versions
      'ubuntu-pro-2204': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-pro-2204-lts',
      'ubuntu-pro-2404': 'projects/ubuntu-os-cloud/global/images/family/ubuntu-pro-2404-lts-amd64',

      // Debian alternatives
      'debian-11': 'projects/debian-cloud/global/images/family/debian-11',
      'debian-12': 'projects/debian-cloud/global/images/family/debian-12'
    };

    const selectedImage = imageMap[osImage] || 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts';
    console.log(`🖼️ Mapping osImage '${osImage}' to: ${selectedImage}`);
    return selectedImage;
  }

  // Get all VPS (both manual and cloud instances)
  async getAllVPS(req, res) {
    try {
      const database = await this.loadVPSDatabase();

      // Get cloud instances
      let cloudInstances = [];
      try {
        const instances = await this.googleCloud.listInstances();
        cloudInstances = Array.isArray(instances) ? instances : [];
      } catch (error) {
        console.warn('Failed to fetch cloud instances:', error.message);
        cloudInstances = [];
      }

      // Ensure database.servers is an array
      const manualServers = Array.isArray(database.servers) ? database.servers : [];

      // Merge manual and cloud instances
      const allVPS = [
        ...manualServers.map(server => ({ ...server, type: 'manual' })),
        ...cloudInstances.map(instance => ({ ...instance, type: 'cloud' }))
      ];

      res.json({
        success: true,
        data: allVPS,
        count: allVPS.length,
        breakdown: {
          manual: manualServers.length,
          cloud: cloudInstances.length
        }
      });
    } catch (error) {
      console.error('Error in getAllVPS:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get single VPS
  async getVPS(req, res) {
    try {
      const { id } = req.params;
      const { type } = req.query;

      if (type === 'cloud') {
        // Get from Google Cloud
        const instance = await this.googleCloud.getInstance(id);
        res.json({
          success: true,
          data: { ...instance, type: 'cloud' }
        });
      } else {
        // Get from local database
        const database = await this.loadVPSDatabase();
        const servers = Array.isArray(database.servers) ? database.servers : [];
        const server = servers.find(s => s.id === id);

        if (!server) {
          return res.status(404).json({
            success: false,
            message: 'VPS server not found'
          });
        }

        res.json({
          success: true,
          data: { ...server, type: 'manual' }
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Create new cloud VPS
  async createCloudVPS(req, res) {
    try {
      const {
        name,
        zone,
        machineType = 'e2-micro',
        diskSize = '10',
        osImage = 'ubuntu-2204-lts',
        username = 'hexacloud',
        password,
        tags = [],
        preemptible = false,
        installDocker = false
      } = req.body;

      // Validation
      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Instance name is required'
        });
      }

      // Map osImage to sourceImage
      const sourceImage = this.mapOsImageToSourceImage(osImage);

      const config = {
        name,
        zone,
        machineType,
        diskSize,
        sourceImage,
        username,
        password: password || 'HexaCloud2024!',
        tags,
        preemptible,
        installDocker
      };

      console.log(`🚀 Creating cloud VPS: ${name}`);
      console.log(`📀 Using image: ${sourceImage}`);
      const instance = await this.googleCloud.createInstance(config);

      res.status(201).json({
        success: true,
        data: { ...instance, type: 'cloud' },
        message: `Cloud VPS '${name}' created successfully`
      });
    } catch (error) {
      console.error('Error creating cloud VPS:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Add manual VPS server - UPDATED for frontend compatibility
  async addManualVPS(req, res) {
    try {
      const { 
        name, 
        host, 
        ip_address,  // ← Frontend compatibility
        port = 22, 
        username, 
        password, 
        provider,    // ← Frontend sends this
        region,      // ← Frontend sends this
        notes,       // ← Frontend sends this
        description, 
        tags = [] 
      } = req.body;

      // Use ip_address if host is not provided (frontend compatibility)
      const serverHost = host || ip_address;

      // Validation
      if (!name || !serverHost || !username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, IP address, username, and password are required'
        });
      }

      const database = await this.loadVPSDatabase();

      // Ensure database.servers is an array
      if (!Array.isArray(database.servers)) {
        database.servers = [];
      }

      // Check if server with same name already exists
      const existingServer = database.servers.find(s => s.name === name);
      if (existingServer) {
        return res.status(400).json({
          success: false,
          message: 'A server with this name already exists'
        });
      }

      const newServer = {
        id: `vps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        host: serverHost,           // Store as host
        ip_address: serverHost,     // Also store as ip_address for compatibility
        port,
        username,
        password, // In production, this should be encrypted
        provider: provider || 'other',
        region: region || '',
        notes: notes || description || '',
        description: description || notes || '',
        tags,
        status: 'unknown',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastConnected: null,
        metrics: null,
        type: 'manual'
      };

      database.servers.push(newServer);
      await this.saveVPSDatabase(database);

      res.status(201).json({
        success: true,
        data: newServer,
        message: 'Manual VPS server added successfully'
      });
    } catch (error) {
      console.error('Error in addManualVPS:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update VPS
  async updateVPS(req, res) {
    try {
      const { id } = req.params;
      const { type } = req.query;
      const updates = req.body;

      if (type === 'cloud') {
        return res.status(400).json({
          success: false,
          message: 'Cloud instances cannot be updated directly. Use cloud-specific operations.'
        });
      }

      // Update manual VPS
      const database = await this.loadVPSDatabase();
      const servers = Array.isArray(database.servers) ? database.servers : [];
      const serverIndex = servers.findIndex(s => s.id === id);

      if (serverIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'VPS server not found'
        });
      }

      database.servers[serverIndex] = {
        ...database.servers[serverIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await this.saveVPSDatabase(database);

      res.json({
        success: true,
        data: database.servers[serverIndex],
        message: 'VPS server updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete VPS
  async deleteVPS(req, res) {
    try {
      const { id } = req.params;
      const { type } = req.query;

      if (type === 'cloud') {
        // Delete cloud instance
        await this.googleCloud.deleteInstance(id);
        res.json({
          success: true,
          message: `Cloud instance '${id}' deleted successfully`
        });
      } else {
        // Delete manual VPS
        const database = await this.loadVPSDatabase();
        const servers = Array.isArray(database.servers) ? database.servers : [];
        const serverIndex = servers.findIndex(s => s.id === id);

        if (serverIndex === -1) {
          return res.status(404).json({
            success: false,
            message: 'VPS server not found'
          });
        }

        const deletedServer = database.servers.splice(serverIndex, 1)[0];
        await this.saveVPSDatabase(database);

        res.json({
          success: true,
          data: deletedServer,
          message: 'Manual VPS server deleted successfully'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Start cloud VPS
  async startCloudVPS(req, res) {
    try {
      const { id } = req.params;
      const { zone } = req.query;

      await this.googleCloud.startInstance(id, zone);

      res.json({
        success: true,
        message: `Cloud instance '${id}' started successfully`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Stop cloud VPS
  async stopCloudVPS(req, res) {
    try {
      const { id } = req.params;
      const { zone } = req.query;

      await this.googleCloud.stopInstance(id, zone);

      res.json({
        success: true,
        message: `Cloud instance '${id}' stopped successfully`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get Google Cloud zones
  async getZones(req, res) {
    try {
      const zones = await this.googleCloud.getZones();
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
  }

  // Get Google Cloud machine types
  async getMachineTypes(req, res) {
    try {
      const { zone } = req.query;
      const machineTypes = await this.googleCloud.getMachineTypes(zone);
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
  }

  // Get OS images
  async getImages(req, res) {
    try {
      const images = await this.googleCloud.getImages();
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
  }

  // Test Google Cloud connection
  async testGCPConnection(req, res) {
    try {
      const result = await this.googleCloud.testConnection();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new VPSController();
