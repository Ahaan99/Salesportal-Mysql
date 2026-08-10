/**
 * DATA LAYER — the single source your UI reads from.
 *
 * Today these functions return mock data. When the real backend is ready,
 * swap the internals to fetch from the API — no UI component changes needed,
 * because no component ever calls an API directly.
 */
import type {
  ChatThread,
  Client,
  CompanyProfile,
  Lead,
  Officer,
  Order,
  Product,
  RegionStat,
  StatPoint,
  StockAdjustment,
} from "@/lib/types";

/* ------------------------------- PRODUCTS ------------------------------- */

const products: Product[] = [
  { id: "P-1001", name: "Himalayan Cold-Pressed Almond Oil", category: "Wellness", price: 649, mrp: 899, stock: 1240, status: "live", rating: 4.7, unitsSold: 8420, launchedAt: "2026-03-12", vendor: "Verdant Naturals", image: "/products/almond-oil.png" },
  { id: "P-1002", name: "Cast Iron Dosa Tawa 12in", category: "Kitchen", price: 1299, mrp: 1799, stock: 460, status: "live", rating: 4.8, unitsSold: 5210, launchedAt: "2026-02-02", vendor: "Verdant Naturals", image: "/products/tawa.png" },
  { id: "P-1003", name: "Organic Jaggery Powder 1kg", category: "Grocery", price: 189, mrp: 240, stock: 3200, status: "live", rating: 4.5, unitsSold: 15300, launchedAt: "2026-01-18", vendor: "Verdant Naturals", image: "/products/jaggery.png" },
  { id: "P-1004", name: "Copper Water Bottle 950ml", category: "Wellness", price: 799, mrp: 1099, stock: 0, status: "paused", rating: 4.6, unitsSold: 3980, launchedAt: "2025-11-09", vendor: "Verdant Naturals", image: "/products/bottle.png" },
  { id: "P-1005", name: "A2 Gir Cow Ghee 500ml", category: "Grocery", price: 1149, mrp: 1450, stock: 890, status: "in-review", rating: 0, unitsSold: 0, launchedAt: "2026-07-10", vendor: "Verdant Naturals", image: "/products/ghee.png" },
  { id: "P-1006", name: "Bamboo Toothbrush Family Pack", category: "Personal Care", price: 249, mrp: 349, stock: 2100, status: "draft", rating: 0, unitsSold: 0, launchedAt: "2026-07-14", vendor: "Verdant Naturals", image: "/products/toothbrush.png" },
];

export function getProducts(): Product[] {
  return products;
}

export function getLiveProducts(): Product[] {
  return products.filter((p) => p.status === "live");
}

/* --------------------------- COMPANY PROFILE ----------------------------- */

const companyProfile: CompanyProfile = {
  companyName: "Verdant Naturals",
  legalName: "Verdant Naturals Private Limited",
  tagline: "Honest, farm-first Indian staples",
  about:
    "We work directly with 40+ farmer collectives across Maharashtra and Rajasthan to bring chemical-free staples and wellness products to modern Indian households.",
  contactName: "Aarav Malhotra",
  email: "aarav@verdantnaturals.in",
  phone: "+91 98220 14455",
  website: "https://verdantnaturals.in",
  gstin: "27AAECV4321F1Z5",
  pan: "AAECV4321F",
  addressLine: "Plot 14, Sanaswadi Industrial Estate",
  city: "Pune",
  state: "Maharashtra",
  pincode: "412208",
  bankName: "HDFC Bank",
  accountNumber: "50200045678912",
  ifsc: "HDFC0001234",
  categories: ["Grocery", "Wellness", "Kitchen", "Personal Care"],
};

export function getCompanyProfile(): CompanyProfile {
  return companyProfile;
}

/* --------------------------- STOCK ADJUSTMENTS --------------------------- */

const stockAdjustments: StockAdjustment[] = [
  { id: "ADJ-3021", productId: "P-1003", productName: "Organic Jaggery Powder 1kg", type: "restock", delta: 1500, resultingStock: 3200, note: "Monsoon season replenishment from Kolhapur unit", at: "2026-07-14T10:20:00" },
  { id: "ADJ-3020", productId: "P-1001", productName: "Himalayan Cold-Pressed Almond Oil", type: "sale", delta: -260, resultingStock: 1240, note: "Weekly channel sales sync", at: "2026-07-13T18:05:00" },
  { id: "ADJ-3019", productId: "P-1002", productName: "Cast Iron Dosa Tawa 12in", type: "damage", delta: -14, resultingStock: 460, note: "Transit damage — claim filed with logistics partner", at: "2026-07-12T09:40:00" },
  { id: "ADJ-3018", productId: "P-1004", productName: "Copper Water Bottle 950ml", type: "sale", delta: -120, resultingStock: 0, note: "Flash sale sold out remaining units", at: "2026-07-10T18:30:00" },
  { id: "ADJ-3017", productId: "P-1005", productName: "A2 Gir Cow Ghee 500ml", type: "restock", delta: 890, resultingStock: 890, note: "Initial stock ahead of listing approval", at: "2026-07-09T11:15:00" },
];

export function getStockAdjustments(): StockAdjustment[] {
  return stockAdjustments;
}

/* -------------------------------- ORDERS -------------------------------- */

const orders: Order[] = [
  { id: "ORD-88231", productName: "Organic Jaggery Powder 1kg", customer: "Sunrise Kirana", city: "Pune", amount: 5670, qty: 30, status: "delivered", soldBy: "field", officerName: "Ravi Deshmukh", date: "2026-07-15" },
  { id: "ORD-88230", productName: "Cast Iron Dosa Tawa 12in", customer: "Meera Iyer", city: "Chennai", amount: 1299, qty: 1, status: "in-transit", soldBy: "online", date: "2026-07-15" },
  { id: "ORD-88229", productName: "Himalayan Cold-Pressed Almond Oil", customer: "GreenMart Stores", city: "Jaipur", amount: 12980, qty: 20, status: "processing", soldBy: "field", officerName: "Anita Shekhawat", date: "2026-07-14" },
  { id: "ORD-88228", productName: "Copper Water Bottle 950ml", customer: "Arjun Nair", city: "Kochi", amount: 1598, qty: 2, status: "delivered", soldBy: "online", date: "2026-07-14" },
  { id: "ORD-88227", productName: "Organic Jaggery Powder 1kg", customer: "Daily Needs Depot", city: "Lucknow", amount: 9450, qty: 50, status: "delivered", soldBy: "field", officerName: "Farhan Qureshi", date: "2026-07-13" },
  { id: "ORD-88226", productName: "Cast Iron Dosa Tawa 12in", customer: "Priya Sharma", city: "Indore", amount: 2598, qty: 2, status: "returned", soldBy: "online", date: "2026-07-12" },
  { id: "ORD-88225", productName: "Himalayan Cold-Pressed Almond Oil", customer: "Wellness Corner", city: "Surat", amount: 6490, qty: 10, status: "delivered", soldBy: "field", officerName: "Kavya Patel", date: "2026-07-12" },
];

export function getOrders(): Order[] {
  return orders;
}

/* ------------------------------- OFFICERS ------------------------------- */

const officers: Officer[] = [
  { id: "FSO-104", name: "Ravi Deshmukh", city: "Pune", region: "West", status: "on-route", salesThisMonth: 284500, unitsSold: 1240, conversionRate: 41, rank: 1, joinedAt: "2025-08-04", avatarSeed: "RD" },
  { id: "FSO-211", name: "Anita Shekhawat", city: "Jaipur", region: "North", status: "active", salesThisMonth: 251200, unitsSold: 1015, conversionRate: 38, rank: 2, joinedAt: "2025-10-19", avatarSeed: "AS" },
  { id: "FSO-097", name: "Farhan Qureshi", city: "Lucknow", region: "North", status: "active", salesThisMonth: 226800, unitsSold: 987, conversionRate: 35, rank: 3, joinedAt: "2025-06-30", avatarSeed: "FQ" },
  { id: "FSO-156", name: "Kavya Patel", city: "Surat", region: "West", status: "on-route", salesThisMonth: 198400, unitsSold: 842, conversionRate: 33, rank: 4, joinedAt: "2025-12-01", avatarSeed: "KP" },
  { id: "FSO-243", name: "Debojit Saha", city: "Guwahati", region: "East", status: "offline", salesThisMonth: 172300, unitsSold: 730, conversionRate: 31, rank: 5, joinedAt: "2026-01-22", avatarSeed: "DS" },
  { id: "FSO-188", name: "Lakshmi Venkat", city: "Coimbatore", region: "South", status: "active", salesThisMonth: 164900, unitsSold: 695, conversionRate: 30, rank: 6, joinedAt: "2026-02-11", avatarSeed: "LV" },
];

export function getOfficers(): Officer[] {
  return officers;
}

export function getCurrentOfficer(): Officer {
  return officers[0];
}

/* --------------------------------- LEADS -------------------------------- */

const leads: Lead[] = [
  { id: "L-501", shopName: "Sunrise Kirana", ownerName: "Mahesh Gupta", area: "Kothrud, Pune", distanceKm: 0.8, potential: "hot", lastVisit: "2026-07-15", suggestedProducts: ["Organic Jaggery Powder 1kg", "A2 Gir Cow Ghee 500ml"] },
  { id: "L-502", shopName: "Balaji Super Store", ownerName: "Nitin Kale", area: "Baner, Pune", distanceKm: 2.4, potential: "hot", lastVisit: null, suggestedProducts: ["Himalayan Cold-Pressed Almond Oil"] },
  { id: "L-503", shopName: "Om Sai General", ownerName: "Sneha Joshi", area: "Aundh, Pune", distanceKm: 3.1, potential: "warm", lastVisit: "2026-07-08", suggestedProducts: ["Cast Iron Dosa Tawa 12in", "Copper Water Bottle 950ml"] },
  { id: "L-504", shopName: "Fresh Basket Mart", ownerName: "Imran Shaikh", area: "Wakad, Pune", distanceKm: 5.6, potential: "warm", lastVisit: "2026-06-28", suggestedProducts: ["Organic Jaggery Powder 1kg"] },
  { id: "L-505", shopName: "City Provision House", ownerName: "Ramesh Yadav", area: "Hinjewadi, Pune", distanceKm: 7.2, potential: "cold", lastVisit: null, suggestedProducts: ["Bamboo Toothbrush Family Pack"] },
];

export function getLeads(): Lead[] {
  return leads;
}

/* -------------------------------- CLIENTS ------------------------------- */

const clients: Client[] = [
  { id: "CL-01", company: "Verdant Naturals", contact: "Aarav Malhotra", productsLive: 4, gmv: 4820000, joinedAt: "2025-09-14", plan: "growth", status: "active" },
  { id: "CL-02", company: "Trishul Spices Co.", contact: "Devika Rao", productsLive: 11, gmv: 9140000, joinedAt: "2025-05-02", plan: "enterprise", status: "active" },
  { id: "CL-03", company: "Kutir Handlooms", contact: "Bhavesh Soni", productsLive: 7, gmv: 2310000, joinedAt: "2026-01-08", plan: "growth", status: "active" },
  { id: "CL-04", company: "AquaPure Appliances", contact: "Tanvi Kulkarni", productsLive: 2, gmv: 780000, joinedAt: "2026-05-27", plan: "starter", status: "onboarding" },
  { id: "CL-05", company: "Nayan Dairy Works", contact: "Harpreet Gill", productsLive: 0, gmv: 0, joinedAt: "2026-07-11", plan: "starter", status: "onboarding" },
];

export function getClients(): Client[] {
  return clients;
}

/* ------------------------------ CHAT THREADS ----------------------------- */

const chatThreads: ChatThread[] = [
  {
    id: "T-01",
    participant: "Aarav Malhotra",
    participantRole: "client",
    lastMessage: "Great, the ghee listing looks good now. When does review complete?",
    time: "10:42 AM",
    unread: 2,
    online: true,
    messages: [
      { id: "m1", role: "user", text: "Hi team, my A2 Ghee listing has been in review for 3 days.", time: "10:35 AM", status: "read" },
      { id: "m2", role: "support", text: "Hello Aarav! Checking with the catalogue team right now.", time: "10:37 AM" },
      { id: "m3", role: "support", text: "Your FSSAI certificate image was blurry — we re-requested it internally. Review completes within 24h.", time: "10:40 AM" },
      { id: "m4", role: "user", text: "Great, the ghee listing looks good now. When does review complete?", time: "10:42 AM", status: "delivered" },
    ],
  },
  {
    id: "T-02",
    participant: "Ravi Deshmukh",
    participantRole: "officer",
    lastMessage: "Sunrise Kirana wants credit terms — can we offer 15 days?",
    time: "9:58 AM",
    unread: 1,
    online: true,
    messages: [
      { id: "m1", role: "user", text: "Closed 30 units of jaggery at Sunrise Kirana!", time: "9:51 AM", status: "read" },
      { id: "m2", role: "support", text: "Excellent work, Ravi. Order ORD-88231 confirmed.", time: "9:54 AM" },
      { id: "m3", role: "user", text: "Sunrise Kirana wants credit terms — can we offer 15 days?", time: "9:58 AM", status: "delivered" },
    ],
  },
  {
    id: "T-03",
    participant: "Devika Rao",
    participantRole: "client",
    lastMessage: "Perfect, thanks for the quick fix.",
    time: "Yesterday",
    unread: 0,
    online: false,
    messages: [
      { id: "m1", role: "user", text: "Our garam masala price update is not reflecting.", time: "4:12 PM", status: "read" },
      { id: "m2", role: "support", text: "Cache issue on our side — fixed. Please verify.", time: "4:30 PM" },
      { id: "m3", role: "user", text: "Perfect, thanks for the quick fix.", time: "4:33 PM", status: "read" },
    ],
  },
  {
    id: "T-04",
    participant: "Anita Shekhawat",
    participantRole: "officer",
    lastMessage: "Reached Jaipur mandi cluster, starting visits.",
    time: "Yesterday",
    unread: 0,
    online: false,
    messages: [
      { id: "m1", role: "user", text: "Reached Jaipur mandi cluster, starting visits.", time: "8:05 AM", status: "read" },
      { id: "m2", role: "support", text: "Noted. 3 hot leads synced to your route today.", time: "8:09 AM" },
    ],
  },
];

export function getChatThreads(): ChatThread[] {
  return chatThreads;
}

export function getSupportThread(role: "client" | "officer"): ChatThread {
  return chatThreads.find((t) => t.participantRole === role) ?? chatThreads[0];
}

/* ------------------------------- ANALYTICS ------------------------------- */

export function getRevenueSeries(): StatPoint[] {
  return [
    { label: "Jan", value: 182 },
    { label: "Feb", value: 214 },
    { label: "Mar", value: 259 },
    { label: "Apr", value: 231 },
    { label: "May", value: 302 },
    { label: "Jun", value: 348 },
    { label: "Jul", value: 391 },
  ];
}

export function getRegionStats(): RegionStat[] {
  return [
    { region: "West", sales: 1420000, officers: 46, growth: 18 },
    { region: "North", sales: 1180000, officers: 39, growth: 12 },
    { region: "South", sales: 960000, officers: 33, growth: 22 },
    { region: "East", sales: 540000, officers: 21, growth: 9 },
  ];
}

export function getAdminKpis() {
  return {
    gmv: 17050000,
    gmvGrowth: 16.4,
    activeOfficers: 139,
    officersGrowth: 11.2,
    liveClients: 48,
    clientsGrowth: 8.7,
    openTickets: 12,
    ticketsChange: -18,
  };
}

export function getClientKpis() {
  return {
    revenue: 482000,
    revenueGrowth: 14.2,
    unitsSold: 3260,
    unitsGrowth: 9.8,
    liveProducts: 4,
    avgRating: 4.65,
    pendingOrders: 3,
  };
}

export function getOfficerKpis() {
  return {
    salesThisMonth: 284500,
    target: 350000,
    unitsSold: 1240,
    visitsToday: 6,
    visitsPlanned: 9,
    commission: 22760,
    streakDays: 14,
  };
}
