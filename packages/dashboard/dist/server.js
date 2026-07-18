import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
const ORCHESTRATOR_URL = 'http://localhost:3001';
// Proxy API requests to orchestrator
app.use('/api', async (req, res) => {
    const url = `${ORCHESTRATOR_URL}/api${req.url}`;
    try {
        const response = await fetch(url, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {})
            },
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
        });
        res.status(response.status);
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('content-type', contentType);
        }
        const bodyText = await response.text();
        res.send(bodyText);
    }
    catch (err) {
        console.error(`Proxy error for ${url}:`, err);
        res.status(502).json({ error: `Bad Gateway: ${err.message}` });
    }
});
// Serve static files from public/
app.use(express.static(path.resolve(__dirname, '..', 'public')));
// SPA fallback
app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});
const PORT = 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║          🏢 ANVAYA DASHBOARD                        ║');
    console.log('║          AI Business Operating System                ║');
    console.log(`║          http://localhost:${PORT}                       ║`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
});
