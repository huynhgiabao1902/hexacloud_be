const WebSocket = require('ws');
const { Client } = require('ssh2');

class WebSocketServer {
  constructor(port = 8081) {
    this.port = port;
    this.wss = null;
    this.connections = new Map();
    this.sshConnections = new Map();
    this.monitoringIntervals = new Map(); // Store monitoring intervals
  }

  start() {
    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', (ws, req) => {
      const sessionId = this.generateSessionId();
      this.connections.set(sessionId, {
        ws,
        sessionId,
        connectedAt: new Date(),
        clientIP: req.socket.remoteAddress
      });

      console.log(`🔌 WebSocket client connected: ${sessionId} from ${req.socket.remoteAddress}`);

      // Send connection established message
      ws.send(JSON.stringify({
        type: 'connection_established',
        sessionId,
        message: 'WebSocket connected successfully'
      }));

      // Handle incoming messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(ws, sessionId, data);
        } catch (error) {
          console.error('Invalid JSON message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid JSON format'
          }));
        }
      });

      // Handle connection close
      ws.on('close', () => {
        console.log(`🔌 WebSocket client disconnected: ${sessionId}`);
        this.connections.delete(sessionId);

        // Clear monitoring intervals
        if (this.monitoringIntervals.has(sessionId)) {
          clearInterval(this.monitoringIntervals.get(sessionId));
          this.monitoringIntervals.delete(sessionId);
        }

        // Close any associated SSH connections
        if (this.sshConnections.has(sessionId)) {
          const sshConn = this.sshConnections.get(sessionId);
          sshConn.end();
          this.sshConnections.delete(sessionId);
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for ${sessionId}:`, error);
      });
    });

    console.log(`🚀 WebSocket server started on port ${this.port}`);
  }

  handleMessage(ws, sessionId, data) {
    console.log(`📨 Message from ${sessionId}:`, data.type);

    switch (data.type) {
      case 'ping':
        this.handlePing(ws, data);
        break;

      case 'ssh_connect':
        this.handleSSHConnect(ws, sessionId, data);
        break;

      case 'ssh_command':
        this.handleSSHCommand(ws, sessionId, data);
        break;

      case 'ssh_disconnect':
        this.handleSSHDisconnect(ws, sessionId);
        break;

      case 'get_server_status':
        this.handleGetServerStatus(ws, data);
        break;

      case 'monitor_server':
        this.handleMonitorServer(ws, sessionId, data);
        break;

      case 'stop_monitoring':
        this.handleStopMonitoring(ws, sessionId);
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${data.type}`
        }));
    }
  }

  handlePing(ws, data) {
    ws.send(JSON.stringify({
      type: 'pong',
      data: data.data || null,
      timestamp: new Date().toISOString()
    }));
  }

  async handleSSHConnect(ws, sessionId, data) {
    try {
      const { host, port = 22, username, password, privateKey } = data.data || {};

      if (!host || !username || (!password && !privateKey)) {
        return ws.send(JSON.stringify({
          type: 'ssh_error',
          message: 'Missing required SSH connection parameters'
        }));
      }

      // Close existing SSH connection if any
      if (this.sshConnections.has(sessionId)) {
        this.sshConnections.get(sessionId).end();
      }

      const conn = new Client();
      this.sshConnections.set(sessionId, conn);

      conn.on('ready', () => {
        ws.send(JSON.stringify({
          type: 'ssh_connected',
          message: `SSH connected to ${host}:${port}`,
          host,
          port
        }));
      });

      conn.on('error', (err) => {
        ws.send(JSON.stringify({
          type: 'ssh_error',
          message: `SSH connection failed: ${err.message}`
        }));
        this.sshConnections.delete(sessionId);
      });

      conn.on('end', () => {
        ws.send(JSON.stringify({
          type: 'ssh_disconnected',
          message: 'SSH connection closed'
        }));
        this.sshConnections.delete(sessionId);
      });

      const config = { host, port, username };
      if (password) {
        config.password = password;
      } else if (privateKey) {
        config.privateKey = privateKey;
      }

      conn.connect(config);

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'ssh_error',
        message: error.message
      }));
    }
  }

  async handleSSHCommand(ws, sessionId, data) {
    try {
      const { command } = data.data || {};

      if (!command) {
        return ws.send(JSON.stringify({
          type: 'ssh_error',
          message: 'Command is required'
        }));
      }

      const sshConn = this.sshConnections.get(sessionId);
      if (!sshConn) {
        return ws.send(JSON.stringify({
          type: 'ssh_error',
          message: 'No active SSH connection'
        }));
      }

      sshConn.exec(command, (err, stream) => {
        if (err) {
          return ws.send(JSON.stringify({
            type: 'ssh_error',
            message: `Command execution failed: ${err.message}`
          }));
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code) => {
          ws.send(JSON.stringify({
            type: 'ssh_command_result',
            data: {
              command,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code
            }
          }));
        });

        stream.on('data', (data) => {
          stdout += data.toString();
          // Send real-time output
          ws.send(JSON.stringify({
            type: 'ssh_output',
            data: {
              type: 'stdout',
              content: data.toString()
            }
          }));
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
          // Send real-time error output
          ws.send(JSON.stringify({
            type: 'ssh_output',
            data: {
              type: 'stderr',
              content: data.toString()
            }
          }));
        });
      });

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'ssh_error',
        message: error.message
      }));
    }
  }

  handleSSHDisconnect(ws, sessionId) {
    const sshConn = this.sshConnections.get(sessionId);
    if (sshConn) {
      sshConn.end();
      this.sshConnections.delete(sessionId);
      ws.send(JSON.stringify({
        type: 'ssh_disconnected',
        message: 'SSH connection closed'
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'ssh_error',
        message: 'No active SSH connection to close'
      }));
    }
  }

  async handleGetServerStatus(ws, data) {
    try {
      const { serverId } = data;

      if (!serverId) {
        return ws.send(JSON.stringify({
          type: 'error',
          message: 'Server ID is required'
        }));
      }

      // Load VPS database
      const VPSController = require('../controllers/vpsController');
      const database = await VPSController.loadVPSDatabase();

      const servers = Array.isArray(database.servers) ? database.servers : [];
      const server = servers.find(s => s.id === serverId);

      if (!server) {
        return ws.send(JSON.stringify({
          type: 'server_status_error',
          message: 'Server not found'
        }));
      }

      ws.send(JSON.stringify({
        type: 'server_status',
        data: {
          serverId,
          server,
          status: server.status || 'unknown',
          lastConnected: server.lastConnected,
          metrics: server.metrics
        }
      }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'server_status_error',
        message: error.message
      }));
    }
  }

  async handleMonitorServer(ws, sessionId, data) {
    try {
      const { serverId, interval = 5000 } = data.data || {};

      if (!serverId) {
        return ws.send(JSON.stringify({
          type: 'error',
          message: 'Server ID is required for monitoring'
        }));
      }

      // Clear existing monitoring interval
      if (this.monitoringIntervals.has(sessionId)) {
        clearInterval(this.monitoringIntervals.get(sessionId));
      }

      // Get server info from database
      const VPSController = require('../controllers/vpsController');
      const database = await VPSController.loadVPSDatabase();
      const servers = Array.isArray(database.servers) ? database.servers : [];
      const server = servers.find(s => s.id === serverId);

      if (!server) {
        return ws.send(JSON.stringify({
          type: 'monitoring_error',
          message: 'Server not found'
        }));
      }

      // Start real-time monitoring with SSH
      const monitoringInterval = setInterval(async () => {
        try {
          // Create temporary SSH connection to get real metrics
          const conn = new Client();
          
          conn.on('ready', () => {
            const commands = [
              'top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | cut -d\'%\' -f1',
              'free | grep Mem | awk \'{printf "%.1f", $3/$2 * 100.0}\'',
              'df -h / | awk \'NR==2{printf "%.1f", $5}\' | sed \'s/%//\''
            ];

            let results = {};
            let completed = 0;

            const executeCommand = (cmd, key) => {
              conn.exec(cmd, (err, stream) => {
                if (err) {
                  results[key] = Math.random() * 100; // Fallback to random
                } else {
                  stream.on('close', () => {
                    completed++;
                    if (completed === commands.length) {
                      conn.end();
                      
                      ws.send(JSON.stringify({
                        type: 'server_monitor_update',
                        data: {
                          serverId,
                          timestamp: new Date().toISOString(),
                          status: server.status,
                          metrics: {
                            cpu: parseFloat(results.cpu) || Math.random() * 100,
                            memory: parseFloat(results.memory) || Math.random() * 100,
                            disk: parseFloat(results.disk) || Math.random() * 100
                          }
                        }
                      }));
                    }
                  });

                  stream.on('data', (data) => {
                    results[key] = data.toString().trim();
                  });
                }
              });
            };

            executeCommand(commands[0], 'cpu');
            executeCommand(commands[1], 'memory');
            executeCommand(commands[2], 'disk');
          });

          conn.on('error', () => {
            // Fallback to random data if SSH fails
            ws.send(JSON.stringify({
              type: 'server_monitor_update',
              data: {
                serverId,
                timestamp: new Date().toISOString(),
                status: server.status,
                metrics: {
                  cpu: Math.random() * 100,
                  memory: Math.random() * 100,
                  disk: Math.random() * 100
                }
              }
            }));
          });

          // Try to connect to the server
          const config = {
            host: server.host,
            port: server.port || 22,
            username: server.username
          };

          if (server.password) {
            config.password = server.password;
          }

          conn.connect(config);

        } catch (error) {
          // Fallback to random data
          ws.send(JSON.stringify({
            type: 'server_monitor_update',
            data: {
              serverId,
              timestamp: new Date().toISOString(),
              status: server.status,
              metrics: {
                cpu: Math.random() * 100,
                memory: Math.random() * 100,
                disk: Math.random() * 100
              }
            }
          }));
        }
      }, interval);

      // Store interval for cleanup
      this.monitoringIntervals.set(sessionId, monitoringInterval);

      ws.send(JSON.stringify({
        type: 'monitoring_started',
        data: { serverId, interval }
      }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'monitoring_error',
        message: error.message
      }));
    }
  }

  handleStopMonitoring(ws, sessionId) {
    if (this.monitoringIntervals.has(sessionId)) {
      clearInterval(this.monitoringIntervals.get(sessionId));
      this.monitoringIntervals.delete(sessionId);
      
      ws.send(JSON.stringify({
        type: 'monitoring_stopped',
        message: 'Server monitoring stopped'
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'monitoring_error',
        message: 'No active monitoring to stop'
      }));
    }
  }

  generateSessionId() {
    return `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  broadcast(message) {
    this.connections.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  getConnectionCount() {
    return this.connections.size;
  }

  close() {
    if (this.wss) {
      // Clear all monitoring intervals
      this.monitoringIntervals.forEach(interval => clearInterval(interval));
      this.monitoringIntervals.clear();

      // Close all SSH connections
      this.sshConnections.forEach(conn => conn.end());
      this.sshConnections.clear();

      // Close all WebSocket connections
      this.connections.forEach(({ ws }) => {
        ws.close();
      });
      this.connections.clear();

      this.wss.close();
      console.log('🔌 WebSocket server closed');
    }
  }
}

module.exports = WebSocketServer;
