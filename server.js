// Custom Next.js server that hosts Socket.io alongside the HTTP server.
// This pattern is required because the default Next.js dev server doesn't
// expose the underlying Node server for us to attach socket.io to.

const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  // Wire up game logic
  const { connectDb } = require('./lib/db');
  const { attachSocketHandlers, startGameLoop } = require('./lib/serverstate');

  await connectDb();
  attachSocketHandlers(io);
  startGameLoop(io);

  httpServer.listen(port, () => {
    console.log(`\n  ⚔  Aetheria running at http://localhost:${port}`);
    console.log(`  ${dev ? '[dev mode]' : '[production]'}\n`);
  });
});
