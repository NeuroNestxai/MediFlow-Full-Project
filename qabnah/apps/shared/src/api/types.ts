/** Domain types for the Qabnah API (see API_CONTRACT.yaml). Money is always integer baisa. */

export type Lang = 'ar' | 'en';
export interface LatLng { lat: number; lng: number }

export type OrderType = 'marketplace' | 'merchant_delivery' | 'c2c';
export type VehicleType = 'bike' | 'car' | 'van';
export type MerchantCategory = 'restaurant' | 'cafe' | 'grocery' | 'pharmacy' | 'retail' | 'flowers' | 'electronics' | 'other';
export type OrderStatus =
  | 'pending_payment' | 'placed' | 'accepted' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery'
  | 'delivered' | 'completed' | 'rejected' | 'cancelled';
export type DeliveryStatus =
  | 'created' | 'searching' | 'unassigned' | 'assigned' | 'at_pickup' | 'picked_up' | 'at_dropoff'
  | 'delivered' | 'failed' | 'returning' | 'returned' | 'cancelled';

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export interface Items<T> { items: T[] }

export interface Tokens { accessToken: string; refreshToken: string; expiresIn: number }
export interface User { id: string; phone: string | null; email: string | null; fullName: string; locale: Lang; status: string; mfaEnabled?: boolean }
export interface AuthResult extends Tokens { user: User; isNewUser: boolean; merchantId?: string }

export interface MeMerchant {
  id: string; slug: string; nameEn: string; nameAr: string; status: string; logoUrl: string | null;
  roles: string[]; permissions: string[];
}
export interface Me {
  user: User;
  roles: { key: string; merchantId: string | null }[];
  permissions: string[];
  merchants: MeMerchant[];
  captain: unknown | null;
}

export interface FileRef { id: string; url: string; mimeType: string; sizeBytes: number }
export type FilePurpose = 'captain_document' | 'merchant_document' | 'product_image' | 'branding' | 'proof_of_delivery' | 'support_attachment' | 'other';

export interface Zone { id: string; code: string; nameEn: string; nameAr: string; isActive: boolean; boundary: GeoPolygon | null }
export interface GeoPolygon { type: 'Polygon'; coordinates: [number, number][][] }

export interface OpeningWindow { weekday: number; open: string; close: string }

export interface MerchantSummary {
  id: string; slug: string; nameEn: string; nameAr: string; category: MerchantCategory;
  logoUrl: string | null; coverUrl: string | null; brandColor: string; accentColor: string;
  taglineEn: string | null; taglineAr: string | null; ratingAvg: number; ratingCount: number;
  isOpen: boolean; prepTimeMinutes: number; minOrderBaisa: number; acceptsCod: boolean; acceptsOnline: boolean;
  distanceM: number | null; location: LatLng;
}

export interface Plan { id: string; code: string; nameEn: string; nameAr: string; monthlyFeeBaisa: number; commissionBps: number; features: Record<string, unknown>; isActive: boolean }

export type WhatsAppEvent = 'order.placed' | 'order.accepted' | 'delivery.picked_up' | 'delivery.delivered';

export interface MerchantDetail extends MerchantSummary {
  status: string; rejectionReason: string | null; legalName: string | null; crNumber: string | null; vatNumber: string | null;
  contactPhone: string | null; contactEmail: string | null; whatsappPhone: string | null; whatsappEnabled: boolean;
  whatsappNotifyEvents: WhatsAppEvent[]; addressText: string; zoneId: string | null; pricesIncludeVat: boolean;
  openingHours: OpeningWindow[]; storeToggleOpen: boolean; commissionBps: number; commissionBpsOverride: number | null;
  plan: Plan | null; storefrontUrl: string; createdAt: string; approvedAt: string | null;
}
export type MerchantUpdate = Partial<{
  nameEn: string; nameAr: string; legalName: string; crNumber: string; vatNumber: string; category: MerchantCategory;
  contactPhone: string; contactEmail: string; whatsappPhone: string; whatsappEnabled: boolean; whatsappNotifyEvents: WhatsAppEvent[];
  location: LatLng; addressText: string; prepTimeMinutes: number; minOrderBaisa: number; acceptsCod: boolean; acceptsOnline: boolean;
  isOpen: boolean; pricesIncludeVat: boolean; openingHours: OpeningWindow[]; logoUrl: string; coverUrl: string;
  brandColor: string; accentColor: string; taglineEn: string; taglineAr: string;
}>;

export interface Banner { id: string; imageUrl: string; titleEn: string | null; titleAr: string | null; linkUrl: string | null; sortOrder: number; isActive: boolean }
export interface BannerInput { imageUrl: string; titleEn?: string; titleAr?: string; linkUrl?: string; sortOrder?: number; isActive?: boolean }

export interface Category { id: string; nameEn: string; nameAr: string; sortOrder: number; isActive: boolean }
export interface CategoryInput { nameEn: string; nameAr: string; sortOrder?: number; isActive?: boolean }

export interface ProductOption { id: string; nameEn: string; nameAr: string; priceDeltaBaisa: number; isAvailable: boolean }
export interface OptionGroup { id: string; kind: 'variant' | 'addon'; nameEn: string; nameAr: string; minSelect: number; maxSelect: number; options: ProductOption[] }
export interface Product {
  id: string; categoryId: string | null; nameEn: string; nameAr: string; descriptionEn: string | null; descriptionAr: string | null;
  imageUrl: string | null; sku: string | null; basePriceBaisa: number; compareAtPriceBaisa: number | null; isAvailable: boolean;
  trackStock: boolean; stockQty: number; sortOrder: number; optionGroups: OptionGroup[];
}
export interface OptionInput { nameEn: string; nameAr: string; priceDeltaBaisa: number; isAvailable: boolean }
export interface OptionGroupInput { kind: 'variant' | 'addon'; nameEn: string; nameAr: string; minSelect: number; maxSelect: number; options: OptionInput[] }
export interface ProductInput {
  categoryId: string | null; nameEn: string; nameAr: string; descriptionEn?: string; descriptionAr?: string; imageUrl?: string; sku?: string;
  basePriceBaisa: number; compareAtPriceBaisa: number | null; isAvailable: boolean; trackStock: boolean; stockQty: number; sortOrder: number;
  optionGroups: OptionGroupInput[];
}

export interface StorefrontMerchant extends MerchantSummary { addressText: string; whatsappPhone: string | null; openingHours: OpeningWindow[] }
export interface Storefront {
  merchant: StorefrontMerchant;
  banners: Banner[];
  categories: (Category & { products: Product[] })[];
  uncategorized: Product[];
}

export interface Place { location: LatLng | null; address: string | null; contactName: string | null; contactPhone: string | null; notes: string | null }
export interface PlaceInput { location?: LatLng; addressId?: string; address?: string; contactName?: string; contactPhone?: string; notes?: string }

export interface CaptainPublic {
  id: string; firstName: string; vehicleType: VehicleType; vehiclePlate: string | null; vehicleColor: string | null; vehicleModel: string | null;
  ratingAvg: number; phone: string | null; location: (LatLng & { heading: number | null; updatedAt: string }) | null;
}
export interface Delivery {
  id: string; status: DeliveryStatus; vehicleType: VehicleType | null; pickup: Place; dropoff: Place;
  packageSize: string | null; packageDescription: string | null; distanceM: number; estimatedDurationS: number;
  feeBaisa: number; codAmountBaisa: number; deliveryPin: string | null; pinRequired: boolean; captain: CaptainPublic | null;
  etaPickupAt: string | null; etaDropoffAt: string | null; assignedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null;
  failureReason: string | null;
}
export interface OrderItemOption { groupId?: string; groupNameEn?: string; groupNameAr?: string; nameEn: string; nameAr: string; priceDeltaBaisa: number }
export interface OrderItem {
  id: string; productId: string | null; nameEn: string; nameAr: string; unitPriceBaisa: number; quantity: number;
  options: OrderItemOption[]; lineTotalBaisa: number; notes: string | null;
}
export interface Order {
  id: string; number: string; type: OrderType; source: string; status: OrderStatus; paymentMethod: 'online' | 'cod' | 'prepaid';
  paymentStatus: string; codPayer: string | null;
  merchant: { id: string; slug: string; nameEn: string; nameAr: string; logoUrl: string | null; contactPhone: string | null } | null;
  customerName: string | null; customerPhone: string | null; items: OrderItem[];
  subtotalBaisa: number; deliveryFeeBaisa: number; serviceFeeBaisa: number; discountBaisa: number; vatBaisa: number; totalBaisa: number;
  codAmountBaisa: number; commissionBaisa?: number; currency: string; notes: string | null; prepTimeMinutes: number | null; cancelReason: string | null;
  createdAt: string; placedAt: string | null; acceptedAt: string | null; readyAt: string | null; deliveredAt: string | null; cancelledAt: string | null;
  delivery: Delivery | null; timeline: { status: OrderStatus; at: string; note: string | null }[]; rated: boolean;
  /** Signed link (30 min) to the bilingual invoice page, once paid or delivered. */
  invoiceUrl?: string | null;
}

export interface Tracking {
  orderId: string; orderStatus: OrderStatus; deliveryStatus: DeliveryStatus | null; pickup: LatLng | null; dropoff: LatLng | null;
  captain: CaptainPublic | null; etaPickupAt: string | null; etaDropoffAt: string | null; path: LatLng[];
}

export interface CartItemInput { productId: string; quantity: number; optionIds?: string[]; notes?: string }
export interface MarketplaceOrderInput {
  merchantId: string; items: CartItemInput[]; addressId?: string; dropoff?: PlaceInput; paymentMethod: 'online' | 'cod'; notes?: string; source?: 'app' | 'storefront';
}
export interface PriceBreakdown {
  subtotalBaisa: number; deliveryFeeBaisa: number; serviceFeeBaisa: number; discountBaisa: number; vatBaisa: number; vatIncluded: boolean;
  totalBaisa: number; distanceM: number; estimatedDurationS: number; currency: string;
  lines: { productId: string; nameEn: string; nameAr: string; quantity: number; unitPriceBaisa: number; lineTotalBaisa: number; options: OrderItemOption[] }[];
}
export interface DeliveryQuote { feeBaisa: number; distanceM: number; estimatedDurationS: number; zoneId: string | null; vehicleType: string | null; currency: string }
export interface Checkout { paymentId: string; provider: 'mock' | 'thawani'; checkoutUrl: string; status: string }

export interface Address {
  id: string; label: string | null; location: LatLng; area: string | null; street: string | null; building: string | null; floor: string | null;
  apartment: string | null; landmark: string | null; contactName: string | null; contactPhone: string | null; isDefault: boolean; zoneId: string | null; createdAt: string;
}
export interface AddressInput {
  label?: string; location: LatLng; area?: string; street?: string; building?: string; floor?: string; apartment?: string; landmark?: string;
  contactName?: string; contactPhone?: string; isDefault?: boolean;
}

export type PaymentLinkStatus = 'active' | 'paid' | 'expired' | 'cancelled';
export interface PaymentLink {
  id: string; code: string; url: string; whatsappShareUrl: string; title: string; description: string | null; amountBaisa: number;
  status: PaymentLinkStatus; customerName: string | null; customerPhone: string | null; requestDelivery: boolean; expiresAt: string | null;
  paidAt: string | null; orderId: string | null; createdAt: string;
}
export interface PublicPaymentLink {
  code: string; title: string; description: string | null; amountBaisa: number; status: PaymentLinkStatus; requestDelivery: boolean;
  expiresAt: string | null; customerName?: string | null;
  merchant: { nameEn: string; nameAr: string; logoUrl: string | null; brandColor: string; slug: string };
}
export interface PaymentStatus { paymentId: string; status: string; amountBaisa: number; orderId: string | null }

export interface StaffMember { userId: string; fullName: string; email: string | null; roles: string[] }
export type MerchantDocType = 'commercial_registration' | 'vat_certificate' | 'municipality_license' | 'owner_id' | 'bank_letter' | 'other';
export interface MerchantDocument {
  id: string; docType: MerchantDocType; fileId: string; fileUrl?: string; number: string | null; expiresAt: string | null;
  status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null; reviewedAt: string | null; createdAt: string;
}

export interface WhatsAppLog {
  outbound: { id: string; to: string; template: string; status: string; provider: string; error: string | null; createdAt: string }[];
  inbound: { id: string; from: string; body: string; createdAt: string }[];
}

export interface LedgerEntry { id: number; entryType: string; amountBaisa: number; orderId: string | null; orderNumber: string | null; description: string; settlementId: string | null; createdAt: string }
export interface Settlement {
  id: string; accountType: 'merchant' | 'captain'; accountId: string; accountName: string | null; periodStart: string; periodEnd: string;
  creditsBaisa: number; debitsBaisa: number; netBaisa: number; entryCount: number; status: 'draft' | 'approved' | 'paid' | 'cancelled';
  payoutReference: string | null; createdBy: string | null; approvedBy: string | null; createdAt: string; approvedAt: string | null; paidAt: string | null;
}
export interface AccountFinance { balanceBaisa: number; unsettledBaisa: number; unsettledEntries: LedgerEntry[]; settlements: Settlement[] }

export interface Analytics {
  from: string; to: string; orders: number; completedOrders: number; cancelledOrders: number; gmvBaisa: number; averageOrderValueBaisa: number;
  deliveryFeesBaisa: number; commissionBaisa: number; avgDeliveryMinutes: number | null; avgAssignSeconds: number | null;
  byType: { type: OrderType; orders: number; gmvBaisa: number }[];
  byDay: { day: string; orders: number; gmvBaisa: number }[];
  topProducts: { nameEn: string; nameAr: string; quantity: number; revenueBaisa: number }[];
  topMerchants: { id: string; nameEn: string; nameAr: string; orders: number; gmvBaisa: number }[];
}
export interface AdminAnalytics extends Analytics {
  captains: { active: number; pending: number; online: number };
  merchants: { active: number; pending: number };
  activeCustomers: number;
}

/* ───────── Admin ───────── */

export interface AdminMerchantDetail extends MerchantDetail {
  documents: (MerchantDocument & { fileUrl: string })[];
  staff: { userId: string; fullName: string; email: string | null; phone: string | null; role: string }[];
  subscriptions: { id: string; planCode: string; status: string; startedAt: string; currentPeriodEnd: string }[];
  stats: { orders: number; gmvBaisa: number };
}

export interface AdminCaptainRow {
  id: string; fullName: string; phone: string; status: string; employmentModel: 'independent' | 'fleet'; fleetPartner: string | null;
  nationality: string | null; vehicleType: VehicleType; vehiclePlate: string | null; isOnline: boolean; ratingAvg: number;
  activeDeliveries: number; pendingDocuments: number; location: LatLng | null; locationAt: string | null; createdAt: string;
}
export type CaptainDocType = 'national_id' | 'driving_license' | 'vehicle_registration' | 'vehicle_insurance' | 'profile_photo' | 'police_clearance';
export interface CaptainDocument {
  id: string; docType: CaptainDocType; fileId: string; fileUrl: string; number: string | null; expiresAt: string | null;
  status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null; createdAt: string;
}
export interface CaptainProfile {
  id: string; userId: string; fullName: string; phone: string; status: string; rejectionReason: string | null;
  employmentModel: 'independent' | 'fleet'; fleetPartner: { id: string; name: string } | null;
  vehicleType: VehicleType; vehicleMake: string | null; vehicleModel: string | null; vehiclePlate: string | null; vehicleColor: string | null;
  nationalIdNumber: string | null; nationality: string | null; dateOfBirth: string | null; bankName: string | null; iban: string | null;
  isOnline: boolean; maxConcurrent: number; ratingAvg: number; ratingCount: number; acceptanceRate: number; zoneIds: string[];
  availability: { weekday: number; start: string; end: string }[]; documents: CaptainDocument[];
  requiredDocuments: CaptainDocType[]; missingDocuments: CaptainDocType[];
}
export interface AdminCaptainDetail extends CaptainProfile {
  stats: { delivered: number; failed: number; cashHeldBaisa: number };
  recentDeliveries: { id: string; status: DeliveryStatus; orderNumber: string; updatedAt: string }[];
}
export interface FleetPartner {
  id: string; name: string; crNumber: string | null; licenceNumber: string | null; licenceExpiresAt: string | null;
  contactName: string | null; contactPhone: string | null; status: string; captains: number;
}

export interface LiveDelivery extends Delivery {
  orderId: string; orderNumber: string; orderType: OrderType; orderStatus: OrderStatus; merchantName: string | null; createdAt: string; dispatchRound: number;
}
export interface LiveCaptain { id: string; fullName: string; vehicleType: VehicleType; location: LatLng; activeDeliveries: number; updatedAt: string }
export interface LiveOps {
  kpis: {
    activeDeliveries: number; unassigned: number; searching: number; onlineCaptains: number; busyCaptains: number;
    ordersToday: number; gmvTodayBaisa: number; avgDeliveryMinutesToday: number | null;
  };
  deliveries: LiveDelivery[];
  captains: LiveCaptain[];
}
export interface AdminDeliveryDetail extends Delivery {
  orderId: string; dispatchRound: number; currentRadiusKm: number | null;
  offers: { id: string; captainId: string; captainName: string; status: string; round: number; score: number | null; distanceToPickupM: number | null; offeredAt: string; respondedAt: string | null; rejectReason: string | null }[];
  events: { type: string; from: string | null; to: string | null; actorUserId: string | null; data: Record<string, unknown>; at: string }[];
  track: (LatLng & { at: string })[];
  proof: { recipientName: string | null; pinVerified: boolean; codCollectedBaisa: number | null; note: string | null; photoUrl: string | null; at: string } | null;
}

export interface PricingRule {
  id: string; name: string; zoneId: string | null; deliveryType: OrderType | null; vehicleType: VehicleType | null;
  baseFeeBaisa: number; perKmBaisa: number; includedKm: number; minFeeBaisa: number; maxFeeBaisa: number | null; maxDistanceKm: number;
  surgeMultiplier: number; captainShareBps: number; priority: number; isActive: boolean;
}
export type PricingRuleInput = Omit<PricingRule, 'id'>;
export interface DispatchRule {
  zoneId: string | null; strategy: 'sequential' | 'broadcast' | 'manual'; autoDispatch: boolean; dispatchOnAccept: boolean;
  searchRadiusKm: number; radiusStepKm: number; maxRadiusKm: number; maxRounds: number; broadcastSize: number; offerTimeoutS: number;
  locationMaxAgeS: number; respectSchedule: boolean; bikeBlackout: { months?: number[]; weekdays?: number[]; start: string; end: string }[];
  weightDistance: number; weightRating: number; weightAcceptance: number;
}
export interface PlatformSettings {
  vatRateBps: number; serviceFeeBaisa: number; defaultCommissionBps: number; codMaxBaisa: number; captainCashLimitBaisa: number;
  merchantAcceptTimeoutMinutes: number; pendingPaymentTimeoutMinutes: number; requireFleetForNonOmani: boolean;
  requiredCaptainDocuments: string[]; supportPhone: string;
  platformLegalName: string; platformCrNumber: string; platformVatNumber: string; platformAddress: string; captainDocumentExpiryNoticeDays: number;
}

export interface TicketMessage { id: string; body: string; isInternal: boolean; author: { id: string; fullName: string; isStaff: boolean }; createdAt: string }
export interface Ticket {
  id: string; number: string; subject: string; category: string; priority: 'low' | 'normal' | 'high' | 'urgent'; status: 'open' | 'pending' | 'resolved' | 'closed';
  orderId: string | null; requester: { id: string; fullName: string; role: string }; assignedTo: string | null; assignedToName: string | null;
  messages?: TicketMessage[]; createdAt: string; updatedAt: string;
}

export interface AdminUser {
  id: string; fullName: string; phone: string | null; email: string | null; status: string; roles: string[]; orders: number; createdAt: string; lastLoginAt: string | null;
}
export interface PlatformStaff { userId: string; fullName: string; email: string | null; status: string; roles: string[]; lastLoginAt: string | null }
export interface RoleInfo { key: string; name: string; scope: 'platform' | 'merchant' | 'self'; permissions: string[] }
export interface RolesResponse { roles: RoleInfo[]; permissions: { key: string; description: string }[] }
export interface AuditLog { id: number; actor: string | null; actorUserId: string | null; action: string; entityType: string; entityId: string | null; data: unknown; ip: string | null; createdAt: string }

export interface FinanceBalances {
  accounts: { accountType: 'merchant' | 'captain'; accountId: string; name: string | null; balanceBaisa: number; unsettledBaisa: number; cashHeldBaisa: number | null }[];
  platformRevenue: { entryType: string; totalBaisa: number }[];
}
