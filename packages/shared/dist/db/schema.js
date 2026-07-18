import { sqliteTable, integer, text, index, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
// ── Businesses (Tenants) ──────────────────────
export const businesses = sqliteTable('businesses', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    type: text('type').notNull(), // e.g., manufacturer, wholesaler
    location: text('location').notNull(),
    gstNumber: text('gst_number'),
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql `(datetime('now'))`).notNull(),
});
// ── Users ─────────────────────────────────────
export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    role: text('role').default('member').notNull(),
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('users_business_idx').on(table.businessId),
}));
// ── Products ──────────────────────────────────
export const products = sqliteTable('products', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    unit: text('unit').notNull(),
    hsnCode: text('hsn_code'),
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('products_business_idx').on(table.businessId),
}));
// ── Inventory ─────────────────────────────────
export const inventory = sqliteTable('inventory', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull().default(0),
    reservedQuantity: real('reserved_quantity').notNull().default(0),
    reorderLevel: real('reorder_level'),
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('inventory_business_idx').on(table.businessId),
    productIdx: index('inventory_product_idx').on(table.productId),
}));
// ── Buyers ────────────────────────────────────
export const buyers = sqliteTable('buyers', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    location: text('location').notNull(),
    type: text('type').notNull(), // retailer, wholesaler, distributor
    reliabilityScore: real('reliability_score'),
    source: text('source').notNull(), // live, seed_data
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('buyers_business_idx').on(table.businessId),
}));
// ── Suppliers ─────────────────────────────────
export const suppliers = sqliteTable('suppliers', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    location: text('location').notNull(),
    type: text('type').notNull(), // manufacturer, raw_material
    reliabilityScore: real('reliability_score'),
    source: text('source').notNull(), // live, seed_data
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('suppliers_business_idx').on(table.businessId),
}));
// ── Transactions ──────────────────────────────
export const transactions = sqliteTable('transactions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // sale, purchase
    buyerId: integer('buyer_id').references(() => buyers.id),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    amount: real('amount').notNull(),
    status: text('status').notNull(), // pending, completed, cancelled
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('transactions_business_idx').on(table.businessId),
}));
// ── Transaction Items ─────────────────────────
export const transactionItems = sqliteTable('transaction_items', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionId: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    productId: integer('product_id').notNull().references(() => products.id),
    quantity: real('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
}, (table) => ({
    transactionIdx: index('transaction_items_tx_idx').on(table.transactionId),
}));
// ── Invoices ──────────────────────────────────
export const invoices = sqliteTable('invoices', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionId: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    invoiceNumber: text('invoice_number').notNull(),
    gstAmount: real('gst_amount').notNull(),
    total: real('total').notNull(),
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    transactionIdx: index('invoices_tx_idx').on(table.transactionId),
}));
// ── Contracts ─────────────────────────────────
export const contracts = sqliteTable('contracts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    counterparty: text('counterparty').notNull(),
    terms: text('terms').notNull(),
    validity: text('validity'),
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('contracts_business_idx').on(table.businessId),
}));
// ── Transport Bookings ────────────────────────
export const transportBookings = sqliteTable('transport_bookings', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionId: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    cost: real('cost').notNull(),
    status: text('status').notNull(),
    route: text('route'), // json
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    transactionIdx: index('transport_bookings_tx_idx').on(table.transactionId),
}));
// ── Negotiation History ───────────────────────
export const negotiationHistory = sqliteTable('negotiation_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    businessId: integer('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    context: text('context').notNull(),
    strategy: text('strategy').notNull(),
    outcome: text('outcome').notNull(), // json
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    businessIdx: index('negotiation_history_business_idx').on(table.businessId),
}));
// ── Documents ─────────────────────────────────
export const documents = sqliteTable('documents', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionId: integer('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // invoice, po, challan, receipt, gst_summary
    contentJson: text('content_json').notNull(), // JSON payload
    createdAt: text('created_at').default(sql `(datetime('now'))`).notNull(),
}, (table) => ({
    transactionIdx: index('documents_tx_idx').on(table.transactionId),
}));
//# sourceMappingURL=schema.js.map