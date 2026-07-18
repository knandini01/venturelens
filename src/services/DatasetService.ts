import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");

export interface Buyer {
  id: string;
  name: string;
  businessType: "retailer" | "wholesaler" | "distributor";
  category: string;
  location: string;
  lat: number;
  lon: number;
  avgOrderVolume: number;
  priceRangeMin: number;
  priceRangeMax: number;
  contact: string;
  phone: string;
  rating: number;
  yearsInBusiness: number;
}

export interface Supplier {
  id: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  product: string;
  category: string;
  unitPrice: number;
  unit: string;
  availableQuantity: number;
  minOrderQty: number;
  leadTimeDays: number;
  contact: string;
  phone: string;
  rating: number;
  isOrganic: boolean;
  certifications: string[];
}

export interface Transport {
  id: string;
  provider: string;
  vehicleType: string;
  capacityKg: number;
  source: string;
  sourceLat: number;
  sourceLon: number;
  destination: string;
  destinationLat: number;
  destinationLon: number;
  travelDate: string;
  baseRate: number;
  costPerKg: number;
  spareCapacityKg: number;
  supportsRefrigeration: boolean;
  supportsFragile: boolean;
  supportsHazardous: boolean;
  contactPhone: string;
  rating: number;
}

export type DatasetName = "buyers" | "suppliers" | "transport";

class DatasetService {
  private buyers: Buyer[];
  private suppliers: Supplier[];
  private transport: Transport[];

  constructor() {
    this.buyers = JSON.parse(readFileSync(join(DATA_DIR, "buyers.json"), "utf-8"));
    this.suppliers = JSON.parse(readFileSync(join(DATA_DIR, "suppliers.json"), "utf-8"));
    this.transport = JSON.parse(readFileSync(join(DATA_DIR, "transport.json"), "utf-8"));
  }

  private getDataset(name: DatasetName): unknown[] {
    switch (name) {
      case "buyers": return this.buyers;
      case "suppliers": return this.suppliers;
      case "transport": return this.transport;
    }
  }

  findAll<T>(dataset: DatasetName): T[] {
    return this.getDataset(dataset) as T[];
  }

  findById<T>(dataset: DatasetName, id: string): T | null {
    const data = this.getDataset(dataset) as Array<{ id: string }>;
    return (data.find(item => item.id === id) as T) ?? null;
  }

  /**
   * Filter dataset by exact-match or range criteria.
   * filters: { key: value } for exact match,
   *          { key: { gte: n } } or { key: { lte: n } } for range,
   *          { key: { contains: str } } for partial string match (case-insensitive)
   */
  findByFilters<T>(dataset: DatasetName, filters: Record<string, unknown>): T[] {
    const data = this.getDataset(dataset) as Array<Record<string, unknown>>;
    return data.filter(item => {
      return Object.entries(filters).every(([key, condition]) => {
        const val = item[key];
        if (condition === null || condition === undefined) return true;
        if (typeof condition === "object" && condition !== null) {
          const cond = condition as Record<string, unknown>;
          if ("gte" in cond && typeof val === "number") return val >= (cond.gte as number);
          if ("lte" in cond && typeof val === "number") return val <= (cond.lte as number);
          if ("contains" in cond && typeof val === "string") {
            return val.toLowerCase().includes((cond.contains as string).toLowerCase());
          }
          if ("in" in cond && Array.isArray(cond.in)) return cond.in.includes(val);
          return true;
        }
        return val === condition;
      });
    }) as T[];
  }

  getBuyers(): Buyer[] { return this.buyers; }
  getSuppliers(): Supplier[] { return this.suppliers; }
  getTransport(): Transport[] { return this.transport; }
}

export const datasetService = new DatasetService();
