const http = require('http');
const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');
const { setupSocket } = require('./socket');

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const server = http.createServer(app);
  setupSocket(server, app);

  server.listen(config.port, () => {
    console.log(`API listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
