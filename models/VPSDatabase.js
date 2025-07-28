const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class VPSDatabase {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.dbFile = path.join(dataDir, 'vps-database.json');
    this.init();
  }

  async init() {
    try {
      // Create data directory if not exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Create database file if not exists
      try {
        await fs.access(this.dbFile);
      } catch (error) {
        const initialData = {
          vps: [],
          lastUpdate: new Date().toISOString(),
          version: '1.0.0'
        };
        await fs.writeFile(this.dbFile, JSON.stringify(initialData, null, 2));
        console.log('✅ VPS Database initialized');
      }
    } catch (error) {
      console.error('❌ Database initialization error:', error);
    }
  }

  async readDatabase() {
    try {
      const data = await fs.readFile(this.dbFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Database read error:', error);
      return { vps: [], lastUpdate: new Date().toISOString() };
    }
  }

  async writeDatabase(data) {
    try {
      data.lastUpdate = new Date().toISOString();
      await fs.writeFile(this.dbFile, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Database write error:', error);
      return false;
    }
  }

  async getAllVPS() {
    const db = await this.readDatabase();
    return db.vps || [];
  }

  async getVPSById(id) {
    const vps = await this.getAllVPS();
    return vps.find(v => v.id === id) || null;
  }

  async addVPS(vpsData) {
    const db = await this.readDatabase();
    const newVPS = {
      id: uuidv4(),
      name: vpsData.name,
      host: vpsData.host,
      port: vpsData.port || 22,
      username: vpsData.username,
      password: vpsData.password, // In production, encrypt this
      description: vpsData.description || '',
      tags: vpsData.tags || [],
      status: 'unknown',
      metrics: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: { rx: 0, tx: 0 },
        uptime: 0,
        load: [0, 0, 0]
      },
      systemInfo: {},
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      lastCheck: null,
      isActive: true
    };

    db.vps.push(newVPS);
    const success = await this.writeDatabase(db);
    return success ? newVPS : null;
  }

  async updateVPS(id, updateData) {
    const db = await this.readDatabase();
    const index = db.vps.findIndex(v => v.id === id);
    
    if (index === -1) return null;

    db.vps[index] = {
      ...db.vps[index],
      ...updateData,
      lastUpdate: new Date().toISOString()
    };

    const success = await this.writeDatabase(db);
    return success ? db.vps[index] : null;
  }

  async deleteVPS(id) {
    const db = await this.readDatabase();
    const initialLength = db.vps.length;
    db.vps = db.vps.filter(v => v.id !== id);
    
    if (db.vps.length < initialLength) {
      return await this.writeDatabase(db);
    }
    return false;
  }

  async updateVPSMetrics(id, metrics) {
    return await this.updateVPS(id, {
      metrics,
      status: 'online',
      lastCheck: new Date().toISOString()
    });
  }

  async setVPSOffline(id, error = null) {
    return await this.updateVPS(id, {
      status: 'offline',
      lastError: error,
      lastCheck: new Date().toISOString()
    });
  }
}

module.exports = VPSDatabase;
