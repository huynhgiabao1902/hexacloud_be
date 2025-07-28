const { Client } = require('ssh2');
const si = require('systeminformation');

class SSHManager {
  constructor() {
    this.connections = new Map();
  }

  // Test SSH connection
  async testConnection(config) {
    return new Promise((resolve) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        resolve({ success: false, error: 'Connection timeout' });
      }, config.timeout || 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        conn.end();
        resolve({ 
          success: true, 
          message: 'SSH connection successful',
          timestamp: new Date().toISOString()
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        resolve({ 
          success: false, 
          error: err.message,
          code: err.code || 'UNKNOWN_ERROR'
        });
      }).connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        readyTimeout: 8000
      });
    });
  }

  // Get system metrics via SSH
  async getSystemMetrics(config) {
    return new Promise((resolve) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        resolve({ success: false, error: 'Metrics collection timeout' });
      }, 15000);

      conn.on('ready', () => {
        this.collectMetrics(conn, (result) => {
          clearTimeout(timeout);
          conn.end();
          resolve(result);
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      }).connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        readyTimeout: 10000
      });
    });
  }

  // Collect metrics via SSH commands
  collectMetrics(conn, callback) {
    const metrics = {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: { rx: 0, tx: 0 },
      uptime: 0,
      load: [0, 0, 0],
      processes: 0,
      systemInfo: {}
    };

    let commandsCompleted = 0;
    const totalCommands = 6;

    const checkComplete = () => {
      commandsCompleted++;
      if (commandsCompleted >= totalCommands) {
        callback({ success: true, metrics, timestamp: new Date().toISOString() });
      }
    };

    // CPU Usage
    conn.exec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1", (err, stream) => {
      if (err) {
        checkComplete();
        return;
      }
      
      let data = '';
      stream.on('data', (chunk) => {
        data += chunk.toString();
      }).on('close', () => {
        const cpuUsage = parseFloat(data.trim()) || 0;
        metrics.cpu = Math.round(cpuUsage);
        checkComplete();
      });
    });

    // Memory Usage
    conn.exec("free | grep Mem | awk '{printf \"%.0f\", $3/$2 * 100.0}'", (err, stream) => {
      if (err) {
        checkComplete();
        return;
      }
      
      let data = '';
      stream.on('data', (chunk) => {
        data += chunk.toString();
      }).on('close', () => {
        const memUsage = parseInt(data.trim()) || 0;
        metrics.memory = memUsage;
        checkComplete();
      });
    });

    // Disk Usage
    conn.exec("df -h / | awk 'NR==2 {print $5}' | cut -d'%' -f1", (err, stream) => {
      if (err) {
        checkComplete();
        return;
      }
      
      let data = '';
      stream.on('data', (chunk) => {
        data += chunk.toString();
      }).on('close', () => {
        const diskUsage = parseInt(data.trim()) || 0;
        metrics.disk = diskUsage;
        checkComplete();
      });
    });

    // Load Average
    conn.exec("uptime | awk -F'load average:' '{print $2}'", (err, stream) => {
      if (err) {
        checkComplete();
        return;
      }
      
      let data = '';
      stream.on('data', (chunk) => {
        data += chunk.toString();
      }).on('close', () => {
        const loads = data.trim().split(',').map(l => parseFloat(l.trim()) || 0);
        metrics.load = loads.slice(0, 3);
        checkComplete();
      });
    });

    // Uptime
    conn.exec("cat /proc/uptime | awk '{print $1}'", (err, stream) => {
      if (err) {
        checkComplete();
        return;
      }
      
      let data = '';
      stream.on('data', (chunk) => {
        data += chunk.toString();
      }).on('close', () => {
        const uptime = parseFloat(data.trim()) || 0;
        metrics.uptime = Math.floor(uptime);
        checkComplete();
      });
    });

    // System Info
    conn.exec("uname -a && lsb_release -a 2>/dev/null || cat /etc/os-release", (err, stream) => {
      if (err) {
        checkComplete();
        return;
      }
      
      let data = '';
      stream.on('data', (chunk) => {
        data += chunk.toString();
      }).on('close', () => {
        metrics.systemInfo.details = data.trim();
        checkComplete();
      });
    });
  }

  // Create WebSocket SSH connection
  createSSHConnection(config, ws) {
    const conn = new Client();
    const sessionId = ws.sessionId;

    conn.on('ready', () => {
      console.log(`✅ SSH connection ready for session ${sessionId}`);
      
      conn.shell((err, stream) => {
        if (err) {
          ws.send(JSON.stringify({
            type: 'ssh_error',
            message: `Shell error: ${err.message}`
          }));
          return;
        }

        // Store the connection
        this.connections.set(sessionId, { conn, stream });

        // Handle shell data
        stream.on('data', (data) => {
          ws.send(JSON.stringify({
            type: 'ssh_data',
            data: data.toString()
          }));
        });

        stream.on('close', () => {
          console.log(` SSH shell closed for session ${sessionId}`);
          this.connections.delete(sessionId);
          ws.send(JSON.stringify({
            type: 'ssh_disconnected',
            message: 'SSH shell closed'
          }));
        });

        ws.send(JSON.stringify({
          type: 'ssh_connected',
          message: `Connected to ${config.username}@${config.host}`,
          sessionId: sessionId
        }));
      });
    });

    conn.on('error', (err) => {
      console.error(`❌ SSH connection error:`, err.message);
      ws.send(JSON.stringify({
        type: 'ssh_error',
        message: `Connection failed: ${err.message}`
      }));
    });

    conn.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      readyTimeout: 10000
    });

    return conn;
  }

  // Send command to SSH session
  sendCommand(sessionId, command) {
    const connection = this.connections.get(sessionId);
    if (!connection || !connection.stream) {
      return false;
    }

    try {
      connection.stream.write(command);
      return true;
    } catch (error) {
      console.error('SSH command error:', error);
      return false;
    }
  }

  // Close SSH connection
  closeConnection(sessionId) {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.conn.end();
      this.connections.delete(sessionId);
      return true;
    }
    return false;
  }

  // Get active connections count
  getActiveConnectionsCount() {
    return this.connections.size;
  }
}

module.exports = SSHManager;
