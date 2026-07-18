import { eq, and } from 'drizzle-orm';
import { db } from './index.js';
import * as schema from './schema.js';

/**
 * Creates a tenant-scoped database accessor.
 * All queries through this object are automatically filtered by businessId.
 */
export function createTenantDb(businessId: number) {
  return {
    products: {
      findAll: async () =>
        await db.select().from(schema.products)
          .where(eq(schema.products.businessId, businessId)),
      create: async (data: Omit<typeof schema.products.$inferInsert, 'businessId'>) => {
        const [result] = await db.insert(schema.products)
          .values({ ...data, businessId })
          .returning();
        return result;
      },
    },
    inventory: {
      findAll: async () =>
        await db.select().from(schema.inventory)
          .where(eq(schema.inventory.businessId, businessId)),
      findByProduct: async (productId: number) => {
        const [result] = await db.select().from(schema.inventory)
          .where(and(eq(schema.inventory.businessId, businessId), eq(schema.inventory.productId, productId)))
          .limit(1);
        return result;
      },
    },
    buyers: {
      findAll: async () =>
        await db.select().from(schema.buyers)
          .where(eq(schema.buyers.businessId, businessId)),
    },
    suppliers: {
      findAll: async () =>
        await db.select().from(schema.suppliers)
          .where(eq(schema.suppliers.businessId, businessId)),
    },
    transactions: {
      findAll: async () =>
        await db.select().from(schema.transactions)
          .where(eq(schema.transactions.businessId, businessId)),
    },
    // We can add more helpers here as needed by the different MCP servers
  };
}
