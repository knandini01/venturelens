const fs = require('fs');

['documents', 'logistics', 'market', 'discovery', 'negotiation'].forEach(pkg => {
  const file = 'packages/mcp-' + pkg + '/src/server.ts';
  let content = fs.readFileSync(file, 'utf8');
  
  // replace imports
  content = content.replace(/import \{ StreamableHTTPServerTransport \}.*?\n/, "import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';\n");
  content = content.replace(/import \{ isInitializeRequest \}.*?\n/, '');
  
  const startIdx = content.indexOf('const transports:');
  const endIdx = content.indexOf('const PORT =');
  
  if (startIdx > -1 && endIdx > -1) {
    const newRoutes = `let transport: SSEServerTransport;

app.get('/sse', async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: 'No active session' });
  }
});

`;
    content = content.substring(0, startIdx) + newRoutes + content.substring(endIdx);
    fs.writeFileSync(file, content);
    console.log('Updated ' + pkg);
  } else {
    console.log('Could not find bounds for ' + pkg);
  }
});
