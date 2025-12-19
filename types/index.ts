/**
 * أنواع TypeScript الموحدة لنظام Leads CRM
 * هذا الملف يحتوي على جميع التعريفات المشتركة
 */

// ==================== حالات الطلب ====================

export type OrderStatus =
    | 'جديد'
    | 'تم التأكيد'
    | 'في انتظار تأكيد العميل'
    | 'رفض التأكيد'
    | 'لم يرد'
    | 'تم التواصل معه واتساب'
    | 'طلب مصاريف الشحن'
    | 'تم الشحن';

// ==================== الطلبات ====================

export interface Order {
    id: number;
    rowIndex: number;
    orderDate: string;
    name: string;
    phone: string;
    whatsapp: string;
    governorate: string;
    area: string;
    address: string;
    orderDetails: string;
    quantity: string;
    totalPrice: string;
    productName: string;
    source: string;
    status: OrderStatus | string;
    notes: string;
    whatsappSent: string;
    assignee?: string;
}

export interface OrderUpdate extends Partial<Order> {
    rowNumber?: number;
}

// ==================== المخزون ====================

export interface StockItem {
    id: number;
    rowIndex: number;
    productName: string;
    initialQuantity: number;
    currentQuantity: number;
    lastUpdate: string;
    synonyms?: string;
    minThreshold?: number;
}

export type StockMovementType =
    | 'sale'
    | 'return'
    | 'damage'
    | 'loss'
    | 'initial'
    | 'adjustment'
    | 'add_stock';

export interface StockMovement {
    id?: number;
    productName: string;
    type: StockMovementType;
    quantity: number;
    quantityBefore?: number;
    quantityAfter?: number;
    reason?: string;
    supplier?: string;
    cost?: number;
    totalCost?: number;
    notes?: string;
    date?: string;
    timestamp?: string;
    orderId?: number;
    responsible?: string;
    status?: string;
    entryDate?: string;
    ipAddress?: string;
    sessionId?: string;
}

export interface StockReports {
    summary: {
        totalProducts: number;
        totalStockValue: number;
        lowStockCount: number;
        outOfStockCount: number;
    };
    byStatus: {
        inStock: number;
        lowStock: number;
        outOfStock: number;
    };
    stockItems: StockItem[];
    alerts: StockItem[];
    lastUpdate: string;
}

// ==================== المستخدمين ====================

export type UserRole = 'admin' | 'agent';

export interface User {
    username: string;
    role: UserRole;
    displayName?: string;
}

export interface UserPayload {
    username: string;
    role: UserRole;
    displayName?: string;
    iat?: number;
    exp?: number;
}

// ==================== الإشعارات ====================

export type NotificationType =
    | 'new_order'
    | 'status_change'
    | 'stock_alert'
    | 'success'
    | 'error'
    | 'warning'
    | 'info'
    | 'critical';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationDisplayMode =
    | 'toast'
    | 'banner'
    | 'modal'
    | 'browser'
    | 'title';

export interface NotificationAction {
    label: string;
    action: () => void;
    style?: 'primary' | 'secondary' | 'danger';
}

export interface SmartNotification {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    timestamp: Date;
    displayModes: NotificationDisplayMode[];
    duration?: number;
    persistent?: boolean;
    dismissible?: boolean;
    grouped?: boolean;
    groupId?: string;
    groupCount?: number;
    soundPlayed?: boolean;
    browserNotified?: boolean;
    isRead?: boolean;
    data?: unknown;
    actions?: NotificationAction[];
}

export interface DoNotDisturbSettings {
    enabled: boolean;
    schedule: {
        enabled: boolean;
        startTime: string; // "22:00"
        endTime: string;   // "08:00"
    };
    allowCritical: boolean;
    silentMode: boolean;
}

export interface NotificationTypeSettings {
    enabled: boolean;
    displayModes: NotificationDisplayMode[];
    duration?: number;
    sound?: boolean;
}

export interface NotificationSettings {
    enabled: boolean;
    soundEnabled: boolean;
    soundVolume: number;
    browserNotifications: boolean;
    titleFlashing: boolean;
    maxVisibleNotifications: number;
    defaultDuration: number;
    groupSimilarNotifications: boolean;
    doNotDisturb: DoNotDisturbSettings;
    typeSettings: Record<NotificationType, NotificationTypeSettings>;
}

// ==================== إعدادات المستخدم ====================

export interface UserNotificationSettings {
    autoRefresh: boolean;
    refreshInterval: number;
    soundEnabled: boolean;
}

// ==================== التقارير ====================

export interface EmployeeStats {
    total: number;
    new: number;
    confirmed: number;
    pending: number;
    rejected: number;
    noAnswer: number;
    contacted: number;
    shipped: number;
    today: number;
}

export interface DistributionStats {
    counts: Record<string, number>;
    total: number;
    imbalance: number;
    isBalanced: boolean;
    maxAllowed: number;
}

// ==================== API Responses ====================

export interface ApiResponse<T = unknown> {
    success?: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface OrdersApiResponse extends ApiResponse {
    data: Order[];
}

export interface StockApiResponse extends ApiResponse {
    stockItems?: StockItem[];
    reports?: StockReports;
    alerts?: StockItem[];
    movements?: StockMovement[];
}

// ==================== أنواع مساعدة ====================

export type TabId =
    | 'dashboard'
    | 'orders'
    | 'follow-up'
    | 'export'
    | 'archive'
    | 'rejected'
    | 'stock';

export interface TabCounts {
    orders: number;
    followUp: number;
    export: number;
}
