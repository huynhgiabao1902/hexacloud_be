
const { google } = require('googleapis');
const path = require('path');

class GoogleCloudService {
  constructor() {
    try {
      // Initialize Google Cloud client using googleapis
      const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!credentialsPath) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
      }

      const auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });

      this.compute = google.compute({ version: 'v1', auth });
      this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      this.defaultZone = process.env.GOOGLE_CLOUD_DEFAULT_ZONE || 'asia-southeast1-a';
      
      console.log(`✅ Google Cloud Service initialized (using googleapis)`);
      console.log(`📁 Project ID: ${this.projectId}`);
      console.log(`🌏 Default Zone: ${this.defaultZone}`);
    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Service:', error.message);
      this.compute = null;
    }
  }

  // Test Google Cloud connection
  async testConnection() {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      console.log('🔍 Testing Google Cloud connection...');
      const response = await this.compute.zones.list({
        project: this.projectId,
        maxResults: 1
      });
      
      console.log('✅ Google Cloud connection successful');
      return {
        success: true,
        message: 'Google Cloud connection successful',
        projectId: this.projectId,
        defaultZone: this.defaultZone,
        zonesAvailable: response.data.items?.length > 0
      };
    } catch (error) {
      console.error('❌ Google Cloud connection failed:', error.message);
      return {
        success: false,
        message: `Google Cloud connection failed: ${error.message}`,
        error: error.code || 'UNKNOWN_ERROR'
      };
    }
  }

  // List all VM instances
  async listInstances() {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      console.log('🔍 Listing all VM instances...');
      const response = await this.compute.instances.aggregatedList({
        project: this.projectId
      });

      const instances = [];
      if (response.data.items) {
        Object.keys(response.data.items).forEach(zone => {
          if (response.data.items[zone].instances) {
            response.data.items[zone].instances.forEach(instance => {
              instances.push(this.formatInstanceData(instance, zone.replace('zones/', '')));
            });
          }
        });
      }

      console.log(`📊 Found ${instances.length} VM instances`);
      return instances;
    } catch (error) {
      console.error('❌ Error listing instances:', error.message);
      throw new Error(`Failed to list instances: ${error.message}`);
    }
  }

  // Get single instance
  async getInstance(name, zone = null) {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      const targetZone = zone || this.defaultZone;
      const response = await this.compute.instances.get({
        project: this.projectId,
        zone: targetZone,
        instance: name
      });
      
      return this.formatInstanceData(response.data, targetZone);
    } catch (error) {
      console.error(`❌ Error getting instance ${name}:`, error.message);
      throw new Error(`Failed to get instance: ${error.message}`);
    }
  }

  // Create new VM instance
  async createInstance(config) {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      const zone = config.zone || this.defaultZone;
      console.log(`🚀 Creating VM instance: ${config.name} in zone: ${zone}`);
      
      const instanceConfig = {
        name: config.name,
        machineType: `zones/${zone}/machineTypes/${config.machineType || 'e2-micro'}`,
        disks: [{
          boot: true,
          autoDelete: true,
          initializeParams: {
            sourceImage: config.sourceImage || 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2004-lts',
            diskSizeGb: config.diskSize || '10'
          }
        }],
        networkInterfaces: [{
          network: 'global/networks/default',
          accessConfigs: [{
            type: 'ONE_TO_ONE_NAT',
            name: 'External NAT'
          }]
        }],
        metadata: {
          items: [
            {
              key: 'startup-script',
              value: this.generateStartupScript(config)
            }
          ]
        },
        tags: {
          items: [...(config.tags || []), 'hexacloud-vps', 'http-server', 'https-server']
        },
        scheduling: {
          preemptible: config.preemptible || false
        }
      };

      const response = await this.compute.instances.insert({
        project: this.projectId,
        zone: zone,
        requestBody: instanceConfig
      });

      console.log('⏳ Waiting for VM creation to complete...');
      
      // Wait for operation to complete
      if (response.data.name) {
        await this.waitForOperation(response.data.name, zone);
      }
      
      // Get the created instance details
      const instance = await this.getInstance(config.name, zone);
      
      console.log(`✅ VM instance created successfully: ${instance.name}`);
      console.log(`🌐 External IP: ${instance.externalIP}`);
      console.log(`🔒 Internal IP: ${instance.internalIP}`);
      
      return instance;
    } catch (error) {
      console.error('❌ Error creating instance:', error.message);
      throw new Error(`Failed to create instance: ${error.message}`);
    }
  }

  // Delete VM instance
  async deleteInstance(name, zone = null) {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      const targetZone = zone || this.defaultZone;
      console.log(`🗑️ Deleting VM instance: ${name}`);
      
      const response = await this.compute.instances.delete({
        project: this.projectId,
        zone: targetZone,
        instance: name
      });

      if (response.data.name) {
        await this.waitForOperation(response.data.name, targetZone);
      }
      
      console.log(`✅ VM instance deleted successfully: ${name}`);
      return { success: true, message: `Instance ${name} deleted successfully` };
    } catch (error) {
      console.error('❌ Error deleting instance:', error.message);
      throw new Error(`Failed to delete instance: ${error.message}`);
    }
  }

  // Start instance
  async startInstance(name, zone = null) {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      const targetZone = zone || this.defaultZone;
      console.log(`▶️ Starting VM instance: ${name}`);
      
      const response = await this.compute.instances.start({
        project: this.projectId,
        zone: targetZone,
        instance: name
      });

      if (response.data.name) {
        await this.waitForOperation(response.data.name, targetZone);
      }
      
      console.log(`✅ VM instance started successfully: ${name}`);
      return { success: true, message: `Instance ${name} started successfully` };
    } catch (error) {
      console.error('❌ Error starting instance:', error.message);
      throw new Error(`Failed to start instance: ${error.message}`);
    }
  }

  // Stop instance
  async stopInstance(name, zone = null) {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      const targetZone = zone || this.defaultZone;
      console.log(`⏹️ Stopping VM instance: ${name}`);
      
      const response = await this.compute.instances.stop({
        project: this.projectId,
        zone: targetZone,
        instance: name
      });

      if (response.data.name) {
        await this.waitForOperation(response.data.name, targetZone);
      }
      
      console.log(`✅ VM instance stopped successfully: ${name}`);
      return { success: true, message: `Instance ${name} stopped successfully` };
    } catch (error) {
      console.error('❌ Error stopping instance:', error.message);
      throw new Error(`Failed to stop instance: ${error.message}`);
    }
  }

  // Get zones
  async getZones() {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      const response = await this.compute.zones.list({
        project: this.projectId
      });
      
      return (response.data.items || [])
        .filter(zone => zone.status === 'UP')
        .map(zone => ({
          name: zone.name,
          description: zone.description,
          status: zone.status,
          region: zone.region?.split('/').pop()
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('❌ Error getting zones:', error.message);
      throw new Error(`Failed to get zones: ${error.message}`);
    }
  }

  // Get machine types
  async getMachineTypes(zone = null) {
    try {
      if (!this.compute || !this.projectId) {
        throw new Error('Google Cloud Service not initialized');
      }
      
      const targetZone = zone || this.defaultZone;
      const response = await this.compute.machineTypes.list({
        project: this.projectId,
        zone: targetZone
      });
      
      return (response.data.items || [])
        .filter(type => type.guestCpus <= 8) // Limit to reasonable sizes
        .map(type => ({
          name: type.name,
          description: type.description,
          guestCpus: type.guestCpus,
          memoryMb: type.memoryMb,
          zone: targetZone
        }))
        .sort((a, b) => a.guestCpus - b.guestCpus);
    } catch (error) {
      console.error('❌ Error getting machine types:', error.message);
      throw new Error(`Failed to get machine types: ${error.message}`);
    }
  }

  // Get available OS images
  async getImages() {
    const commonImages = [
      {
        project: 'ubuntu-os-cloud',
        family: 'ubuntu-2004-lts',
        name: 'Ubuntu 20.04 LTS',
        description: 'Ubuntu 20.04 LTS - Recommended for most workloads'
      },
      {
        project: 'ubuntu-os-cloud',
        family: 'ubuntu-2204-lts',
        name: 'Ubuntu 22.04 LTS',
        description: 'Ubuntu 22.04 LTS - Latest LTS version'
      },
      {
        project: 'centos-cloud',
        family: 'centos-7',
        name: 'CentOS 7',
        description: 'CentOS 7 - Enterprise-class Linux'
      },
      {
        project: 'debian-cloud',
        family: 'debian-11',
        name: 'Debian 11',
        description: 'Debian 11 (Bullseye) - Stable Linux distribution'
      }
    ];

    return commonImages.map(img => ({
      ...img,
      sourceImage: `projects/${img.project}/global/images/family/${img.family}`
    }));
  }

  // Wait for operation to complete
  async waitForOperation(operationName, zone) {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max wait
    
    while (attempts < maxAttempts) {
      try {
        const response = await this.compute.zoneOperations.get({
          project: this.projectId,
          zone: zone,
          operation: operationName
        });
        
        if (response.data.status === 'DONE') {
          if (response.data.error) {
            throw new Error(`Operation failed: ${JSON.stringify(response.data.error)}`);
          }
          return response.data;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;
      } catch (error) {
        if (attempts >= maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }
    }
    
    throw new Error('Operation timeout');
  }

  // Format instance data
  formatInstanceData(instance, zone) {
    return {
      id: instance.id,
      name: instance.name,
      zone: zone,
      status: instance.status,
      machineType: instance.machineType?.split('/').pop() || 'unknown',
      internalIP: instance.networkInterfaces?.[0]?.networkIP || null,
      externalIP: instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || null,
      creationTimestamp: instance.creationTimestamp,
      lastStartTimestamp: instance.lastStartTimestamp,
      disks: instance.disks?.map(disk => ({
        name: disk.deviceName,
        size: disk.diskSizeGb || disk.initializeParams?.diskSizeGb,
        type: disk.type?.split('/').pop() || 'standard'
      })) || [],
      tags: instance.tags?.items || [],
      canIpForward: instance.canIpForward || false,
      scheduling: instance.scheduling || {}
    };
  }

  // Generate startup script
  generateStartupScript(config) {
    const username = config.username || 'hexacloud';
    const password = config.password || 'HexaCloud2024!';
    
    return `#!/bin/bash
# HexaCloud VPS Setup Script
echo "🚀 Starting HexaCloud VPS setup..." > /var/log/hexacloud-setup.log

# Update system
apt-get update -y
apt-get upgrade -y

# Install essential packages
apt-get install -y openssh-server curl wget git htop nano vim ufw net-tools

# Create user
useradd -m -s /bin/bash ${username}
echo "${username}:${password}" | chpasswd
usermod -aG sudo ${username}

# Configure SSH
systemctl enable ssh
systemctl start ssh
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl restart ssh

# Configure firewall
ufw --force enable
ufw allow ssh

echo "✅ Setup completed!" >> /var/log/hexacloud-setup.log
`;
  }
}

module.exports = GoogleCloudService;
