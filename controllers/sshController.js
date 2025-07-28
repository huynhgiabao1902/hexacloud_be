const { Client } = require('ssh2');

class SSHController {
  constructor() {
    this.connections = new Map();
  }

  // Test SSH connection
  async testConnection(req, res) {
    try {
      const { host, port = 22, username, password, privateKey } = req.body;

      if (!host || !username || (!password && !privateKey)) {
        return res.status(400).json({
          success: false,
          message: 'Host, username, and password/privateKey are required'
        });
      }

      const conn = new Client();
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          conn.end();
          resolve(res.status(408).json({
            success: false,
            message: 'Connection timeout'
          }));
        }, 10000);

        conn.on('ready', () => {
          clearTimeout(timeout);
          conn.end();
          resolve(res.json({
            success: true,
            message: 'SSH connection successful'
          }));
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          resolve(res.status(500).json({
            success: false,
            message: `SSH connection failed: ${err.message}`
          }));
        });

        const config = {
          host,
          port,
          username
        };

        if (password) {
          config.password = password;
        } else if (privateKey) {
          config.privateKey = privateKey;
        }

        conn.connect(config);
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Execute command via SSH
  async executeCommand(req, res) {
    try {
      const { host, port = 22, username, password, privateKey, command } = req.body;

      if (!host || !username || (!password && !privateKey) || !command) {
        return res.status(400).json({
          success: false,
          message: 'Host, username, password/privateKey, and command are required'
        });
      }

      const conn = new Client();
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          conn.end();
          resolve(res.status(408).json({
            success: false,
            message: 'Connection timeout'
          }));
        }, 30000);

        conn.on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              conn.end();
              return resolve(res.status(500).json({
                success: false,
                message: `Command execution failed: ${err.message}`
              }));
            }

            let stdout = '';
            let stderr = '';

            stream.on('close', (code) => {
              clearTimeout(timeout);
              conn.end();
              resolve(res.json({
                success: true,
                data: {
                  stdout: stdout.trim(),
                  stderr: stderr.trim(),
                  exitCode: code
                }
              }));
            });

            stream.on('data', (data) => {
              stdout += data.toString();
            });

            stream.stderr.on('data', (data) => {
              stderr += data.toString();
            });
          });
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          resolve(res.status(500).json({
            success: false,
            message: `SSH connection failed: ${err.message}`
          }));
        });

        const config = {
          host,
          port,
          username
        };

        if (password) {
          config.password = password;
        } else if (privateKey) {
          config.privateKey = privateKey;
        }

        conn.connect(config);
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get system info via SSH
  async getSystemInfo(req, res) {
    try {
      const { host, port = 22, username, password, privateKey } = req.body;

      if (!host || !username || (!password && !privateKey)) {
        return res.status(400).json({
          success: false,
          message: 'Host, username, and password/privateKey are required'
        });
      }

      const commands = {
        os: 'uname -a',
        distro: 'cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'',
        uptime: 'uptime -p',
        memory: 'free -h',
        disk: 'df -h /',
        cpu: 'lscpu | grep "Model name" | cut -d: -f2 | xargs'
      };

      const conn = new Client();
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          conn.end();
          resolve(res.status(408).json({
            success: false,
            message: 'Connection timeout'
          }));
        }, 30000);

        conn.on('ready', () => {
          const results = {};
          const commandKeys = Object.keys(commands);
          let completed = 0;

          const executeCommand = (key) => {
            conn.exec(commands[key], (err, stream) => {
              if (err) {
                results[key] = `Error: ${err.message}`;
                completed++;
                if (completed === commandKeys.length) {
                  clearTimeout(timeout);
                  conn.end();
                  resolve(res.json({
                    success: true,
                    data: results
                  }));
                }
              } else {
                stream.on('close', () => {
                  completed++;
                  if (completed === commandKeys.length) {
                    clearTimeout(timeout);
                    conn.end();
                    resolve(res.json({
                      success: true,
                      data: results
                    }));
                  }
                });

                stream.on('data', (data) => {
                  results[key] = data.toString().trim();
                });

                stream.stderr.on('data', (data) => {
                  results[key] = `Error: ${data.toString().trim()}`;
                });
              }
            });
          };

          commandKeys.forEach(executeCommand);
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          resolve(res.status(500).json({
            success: false,
            message: `SSH connection failed: ${err.message}`
          }));
        });

        const config = {
          host,
          port,
          username
        };

        if (password) {
          config.password = password;
        } else if (privateKey) {
          config.privateKey = privateKey;
        }

        conn.connect(config);
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new SSHController();
