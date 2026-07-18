import { db } from './index.js';
import * as schema from './schema.js';

async function seed() {
  console.log('Seeding database...');

  // 1. Create a primary business (The User)
  const [business] = await db.insert(schema.businesses).values({
    name: 'Kochi Naturals',
    type: 'manufacturer',
    location: 'Kochi, Kerala, India',
    gstNumber: '32ABCDE1234F1Z5',
  }).returning();

  console.log(`Created business: ${business.name} (ID: ${business.id})`);

  // 2. Create products
  const products = [
    { businessId: business.id, name: 'Handmade Turmeric Soap', category: 'Personal Care', unit: 'pieces' },
    { businessId: business.id, name: 'Coconut Oil 500ml', category: 'Personal Care', unit: 'bottles' },
  ];
  
  const insertedProducts = [];
  for (const p of products) {
    const [inserted] = await db.insert(schema.products).values(p).returning();
    insertedProducts.push(inserted);
  }

  // 3. Create inventory for the soap (1200 units as per the workflow example)
  await db.insert(schema.inventory).values({
    businessId: business.id,
    productId: insertedProducts[0].id,
    quantity: 1200,
    reorderLevel: 200,
  });

  // 4. Create Buyers (seed data)
  const buyers = [
    { businessId: business.id, name: 'RetailMart Bangalore', location: 'Bangalore, Karnataka', type: 'retailer', reliabilityScore: 4.5, source: 'seed_data' },
    { businessId: business.id, name: 'Kerala Distributors', location: 'Trivandrum, Kerala', type: 'distributor', reliabilityScore: 4.8, source: 'seed_data' },
    { businessId: business.id, name: 'Chennai Super Bazaar', location: 'Chennai, Tamil Nadu', type: 'wholesaler', reliabilityScore: 4.2, source: 'seed_data' },
  ];
  
  for (const b of buyers) {
    await db.insert(schema.buyers).values(b);
  }

  // 5. Create Suppliers (seed data for Workflow 2)
  const suppliers = [
    { businessId: business.id, name: 'Erode Spice Farms', location: 'Erode, Tamil Nadu', type: 'raw_material', reliabilityScore: 4.7, source: 'seed_data' },
    { businessId: business.id, name: 'Malabar Oils', location: 'Kozhikode, Kerala', type: 'raw_material', reliabilityScore: 4.6, source: 'seed_data' },
  ];

  for (const s of suppliers) {
    await db.insert(schema.suppliers).values(s);
  }

  console.log('Seeding complete.');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
