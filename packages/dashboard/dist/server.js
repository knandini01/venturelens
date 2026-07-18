import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
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
