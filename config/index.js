require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 8080,
    wsPort: parseInt(process.env.WS_PORT) || 8081,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    name: process.env.SERVER_NAME || 'HexaCloud-Backend',
    version: process.env.SERVER_VERSION || '1.0.0'
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'default-secret-key',
    jwtExpiration: process.env.JWT_EXPIRATION || '24h',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    trustProxy: process.env.TRUST_PROXY === 'true',
    helmetEnabled: process.env.HELMET_ENABLED !== 'false'
  },

  // Database Configuration
  database: {
    dataDir: process.env.DATA_DIR || './data',
    vpsDbFile: process.env.VPS_DB_FILE || 'vps-database.json',
    backupDir: process.env.BACKUP_DIR || './backups',
    autoBackup: process.env.AUTO_BACKUP !== 'false',
    backupInterval: parseInt(process.env.BACKUP_INTERVAL) || 3600000
  },

  // SSH Configuration
  ssh: {
    timeout: parseInt(process.env.SSH_TIMEOUT) || 30000,
    keepaliveInterval: parseInt(process.env.SSH_KEEPALIVE_INTERVAL) || 10000,
    maxSessions: parseInt(process.env.MAX_SSH_SESSIONS) || 50,
    connectionRetry: parseInt(process.env.SSH_CONNECTION_RETRY) || 3,
    defaultPort: parseInt(process.env.SSH_DEFAULT_PORT) || 22
  },

  // WebSocket Configuration
  websocket: {
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS) || 100,
    messageSizeLimit: parseInt(process.env.WS_MESSAGE_SIZE_LIMIT) || 1048576
  },

  // Monitoring Configuration
  monitoring: {
    interval: parseInt(process.env.MONITORING_INTERVAL) || 10000,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    metricsRetentionDays: parseInt(process.env.METRICS_RETENTION_DAYS) || 7,
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || './logs/hexacloud.log'
  },

  // Rate Limiting
  rateLimit: {
    enabled: process.env.API_RATE_LIMIT !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },

  // Google Cloud Configuration
  googleCloud: {
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    defaultZone: process.env.GOOGLE_CLOUD_DEFAULT_ZONE || 'asia-southeast1-a',
    defaultRegion: process.env.GOOGLE_CLOUD_DEFAULT_REGION || 'asia-southeast1',
    defaultMachineType: process.env.GOOGLE_CLOUD_DEFAULT_MACHINE_TYPE || 'e2-micro',
    defaultDiskSize: process.env.GOOGLE_CLOUD_DEFAULT_DISK_SIZE || '10',
    defaultImage: process.env.GOOGLE_CLOUD_DEFAULT_IMAGE || 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2004-lts',
    maxInstances: parseInt(process.env.GOOGLE_CLOUD_MAX_INSTANCES) || 10,
    timeout: parseInt(process.env.GOOGLE_CLOUD_TIMEOUT) || 30000
  },

  // VPS Configuration
  vps: {
    defaultUsername: process.env.DEFAULT_VPS_USERNAME || 'hexacloud',
    defaultPassword: process.env.DEFAULT_VPS_PASSWORD || 'HexaCloud2024!',
    setupTimeout: parseInt(process.env.VPS_SETUP_TIMEOUT) || 300000,
    monitoringEnabled: process.env.VPS_MONITORING_ENABLED !== 'false'
  },

  // Feature Flags
  features: {
    sshTerminal: process.env.FEATURE_SSH_TERMINAL !== 'false',
    fileManager: process.env.FEATURE_FILE_MANAGER !== 'false',
    monitoring: process.env.FEATURE_MONITORING !== 'false',
    dockerSupport: process.env.FEATURE_DOCKER_SUPPORT !== 'false',
    bulkOperations: process.env.FEATURE_BULK_OPERATIONS !== 'false',
    apiKeys: process.env.FEATURE_API_KEYS === 'true'
  },

  // Cache Configuration
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CACHE_TTL) || 300000,
    redisUrl: process.env.REDIS_URL,
    redisEnabled: process.env.REDIS_ENABLED === 'true'
  },

  // Upload Configuration
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
    allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || ['.json', '.txt', '.sh', '.yml', '.yaml']
  },

  // Development Settings
  development: {
    debug: process.env.DEBUG === 'true',
    verboseLogging: process.env.VERBOSE_LOGGING === 'true',
    apiDocsEnabled: process.env.API_DOCS_ENABLED !== 'false',
    swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false'
  }
};

// Validate required configuration
const validateConfig = () => {
  const required = [
    'security.jwtSecret',
    'googleCloud.projectId',
    'googleCloud.credentialsPath'
  ];

  const missing = [];
  
  required.forEach(path => {
    const keys = path.split('.');
    let value = config;
    
    for (const key of keys) {
      value = value?.[key];
    }
    
    if (!value) {
      missing.push(path);
    }
  });

  if (missing.length > 0) {
    console.error('❌ Missing required configuration:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }
};

// Validate configuration on load
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

module.exports = config;
