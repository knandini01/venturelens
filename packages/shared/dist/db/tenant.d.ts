import * as schema from './schema.js';
/**
 * Creates a tenant-scoped database accessor.
 * All queries through this object are automatically filtered by businessId.
 */
export declare function createTenantDb(businessId: number): {
    products: {
        findAll: () => Promise<{
            id: number;
            name: string;
            createdAt: string;
            updatedAt: string;
            businessId: number;
            category: string;
            unit: string;
            hsnCode: string | null;
        }[]>;
        create: (data: Omit<typeof schema.products.$inferInsert, "businessId">) => Promise<{
            id: number;
            name: string;
            createdAt: string;
            updatedAt: string;
            businessId: number;
            category: string;
            unit: string;
            hsnCode: string | null;
        }>;
    };
    inventory: {
        findAll: () => Promise<{
            id: number;
            createdAt: string;
            updatedAt: string;
            businessId: number;
            productId: number;
            quantity: number;
            reservedQuantity: number;
            reorderLevel: number | null;
        }[]>;
        findByProduct: (productId: number) => Promise<{
            id: number;
            createdAt: string;
            updatedAt: string;
            businessId: number;
            productId: number;
            quantity: number;
            reservedQuantity: number;
            reorderLevel: number | null;
        }>;
    };
    buyers: {
        findAll: () => Promise<{
            id: number;
            name: string;
            type: string;
            location: string;
            createdAt: string;
            updatedAt: string;
            businessId: number;
            reliabilityScore: number | null;
            source: string;
        }[]>;
    };
    suppliers: {
        findAll: () => Promise<{
            id: number;
            name: string;
            type: string;
            location: string;
            createdAt: string;
            updatedAt: string;
            businessId: number;
            reliabilityScore: number | null;
            source: string;
        }[]>;
    };
    transactions: {
        findAll: () => Promise<{
            id: number;
            type: string;
            createdAt: string;
            updatedAt: string;
            businessId: number;
            buyerId: number | null;
            supplierId: number | null;
            amount: number;
            status: string;
        }[]>;
    };
};
