export type ProductStatus = "live" | "in-review" | "draft" | "paused";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  mrp: number;
  stock: number;
  status: ProductStatus;
  rating: number;
  unitsSold: number;
  launchedAt: string;
  vendor: string;
  image: string;
}

/** Editable fields when creating or updating a product. */
export interface ProductInput {
  name: string;
  category: string;
  price: number;
  mrp: number;
  stock: number;
  status: ProductStatus;
  image: string;
}

export type StockAdjustmentType = "restock" | "correction" | "damage" | "sale";

export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  type: StockAdjustmentType;
  delta: number;
  resultingStock: number;
  note: string;
  at: string;
}

export interface CompanyProfile {
  companyName: string;
  legalName: string;
  tagline: string;
  about: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  gstin: string;
  pan: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  categories: string[];
}

export type OrderStatus = "delivered" | "in-transit" | "processing" | "returned";

export interface Order {
  id: string;
  productName: string;
  customer: string;
  city: string;
  amount: number;
  qty: number;
  status: OrderStatus;
  soldBy: "online" | "field";
  officerName?: string;
  date: string;
}

export type OfficerStatus = "active" | "on-route" | "offline";

export interface Officer {
  id: string;
  name: string;
  city: string;
  region: string;
  status: OfficerStatus;
  salesThisMonth: number;
  unitsSold: number;
  conversionRate: number;
  rank: number;
  joinedAt: string;
  avatarSeed: string;
}

export interface Lead {
  id: string;
  shopName: string;
  ownerName: string;
  area: string;
  distanceKm: number;
  potential: "hot" | "warm" | "cold";
  lastVisit: string | null;
  suggestedProducts: string[];
}

export interface Client {
  id: string;
  company: string;
  contact: string;
  productsLive: number;
  gmv: number;
  joinedAt: string;
  plan: "starter" | "growth" | "enterprise";
  status: "active" | "onboarding" | "suspended";
}

export type ChatRole = "user" | "support";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  time: string;
  status?: "sent" | "delivered" | "read";
}

export interface ChatThread {
  id: string;
  participant: string;
  participantRole: "client" | "officer";
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  messages: ChatMessage[];
}

export interface StatPoint {
  label: string;
  value: number;
}

export interface RegionStat {
  region: string;
  sales: number;
  officers: number;
  growth: number;
}
