import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
class DatasetService {
    buyers;
    suppliers;
    transport;
    constructor() {
        this.buyers = JSON.parse(readFileSync(join(DATA_DIR, "buyers.json"), "utf-8"));
        this.suppliers = JSON.parse(readFileSync(join(DATA_DIR, "suppliers.json"), "utf-8"));
        this.transport = JSON.parse(readFileSync(join(DATA_DIR, "transport.json"), "utf-8"));
    }
    getDataset(name) {
        switch (name) {
            case "buyers": return this.buyers;
            case "suppliers": return this.suppliers;
            case "transport": return this.transport;
        }
    }
    findAll(dataset) {
        return this.getDataset(dataset);
    }
    findById(dataset, id) {
        const data = this.getDataset(dataset);
        return data.find(item => item.id === id) ?? null;
    }
    /**
     * Filter dataset by exact-match or range criteria.
     * filters: { key: value } for exact match,
     *          { key: { gte: n } } or { key: { lte: n } } for range,
     *          { key: { contains: str } } for partial string match (case-insensitive)
     */
    findByFilters(dataset, filters) {
        const data = this.getDataset(dataset);
        return data.filter(item => {
            return Object.entries(filters).every(([key, condition]) => {
                const val = item[key];
                if (condition === null || condition === undefined)
                    return true;
                if (typeof condition === "object" && condition !== null) {
                    const cond = condition;
                    if ("gte" in cond && typeof val === "number")
                        return val >= cond.gte;
                    if ("lte" in cond && typeof val === "number")
                        return val <= cond.lte;
                    if ("contains" in cond && typeof val === "string") {
                        return val.toLowerCase().includes(cond.contains.toLowerCase());
                    }
                    if ("in" in cond && Array.isArray(cond.in))
                        return cond.in.includes(val);
                    return true;
                }
                return val === condition;
            });
        });
    }
    getBuyers() { return this.buyers; }
    getSuppliers() { return this.suppliers; }
    getTransport() { return this.transport; }
}
export const datasetService = new DatasetService();
//# sourceMappingURL=DatasetService.js.map