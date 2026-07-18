import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { geocodeCity } from './services/nominatim.js';
import { getRoute } from './services/osrm.js';
const server = new McpServer({ name: 'anvaya-logistics', version: '1.0.0' });
// Average cost per km in INR for a mini truck
const COST_PER_KM_INR = 45;
// ── Estimate Transport Cost ──────────────────────
server.tool('estimate_transport_cost', 'Estimate the distance, duration, and cost of transporting goods between two cities in India', {
    originCity: z.string().describe('Origin city name'),
    destinationCity: z.string().describe('Destination city name'),
}, async ({ originCity, destinationCity }) => {
    try {
        const origin = await geocodeCity(originCity);
        const destination = await geocodeCity(destinationCity);
        const route = await getRoute(origin.lat, origin.lon, destination.lat, destination.lon);
        const estimatedCost = Math.round(route.distance_km * COST_PER_KM_INR);
        return {
            content: [{
                    type: 'text',
                    text: `Estimated Transport:\nFrom: ${origin.display_name}\nTo: ${destination.display_name}\nDistance: ${route.distance_km.toFixed(1)} km\nDuration: ${route.duration_hours.toFixed(1)} hours\nCost Estimate: ₹${estimatedCost}`
                }],
            structuredContent: {
                success: true,
                data: {
                    origin: originCity,
                    destination: destinationCity,
                    distance_km: route.distance_km,
                    duration_hours: route.duration_hours,
                    estimated_cost: estimatedCost
                },
                source: 'estimated'
            },
        };
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error estimating transport: ${err.message}` }], isError: true };
    }
});
// ── Book Transport (Requires Confirmation) ───────
server.tool('book_transport', 'Book a transport vehicle for a specific transaction. Requires user confirmation.', {
    transactionId: z.number().describe('Transaction ID'),
    originCity: z.string().describe('Origin city name'),
    destinationCity: z.string().describe('Destination city name'),
    estimatedCost: z.number().describe('Estimated cost in INR'),
}, async (payload) => {
    return {
        content: [{ type: 'text', text: `Requires confirmation to book transport for transaction ${payload.transactionId}` }],
        structuredContent: {
            requires_confirmation: true,
            action: 'book_transport',
            summary: `Book transport from ${payload.originCity} to ${payload.destinationCity} (Est: ₹${payload.estimatedCost})`,
            payload,
        },
    };
});
// ── Track Shipment ───────────────────────────────
server.tool('track_shipment', 'Get the current status of a transport booking', { bookingId: z.number().describe('Transport booking ID') }, async ({ bookingId }) => {
    // In a real system, we'd query the DB or an external logistics provider
    // For now, we return a mock status based on the ID to simulate tracking
    const statuses = ['In Transit', 'Out for Delivery', 'Delivered', 'Delayed'];
    const status = statuses[bookingId % statuses.length];
    return {
        content: [{ type: 'text', text: `Tracking Booking ${bookingId}: ${status}` }],
        structuredContent: { success: true, data: { bookingId, status }, source: 'estimated' },
    };
});
// ── HTTP Server Setup ────────────────────────────
const app = express();
let transport;
app.get('/sse', async (req, res) => {
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
});
app.post('/messages', async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(400).json({ error: 'No active session' });
    }
});
const PORT = 3008;
app.listen(PORT, () => {
    console.log(`Logistics MCP server listening on port ${PORT}`);
});
