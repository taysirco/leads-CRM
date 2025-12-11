/**
 * أنواع ومكونات مشتركة لإدارة المخزون
 */

// إعادة تصدير الأنواع من الملف الرئيسي
export type { StockItem, StockMovement, StockReports, StockMovementType } from '../../types';

// أنواع خاصة بمكونات المخزون
export type StockTabId = 'overview' | 'add' | 'returns' | 'reports' | 'movements';

export interface StockMessage {
    type: 'success' | 'error';
    text: string;
}

export interface StockFormData {
    productName: string;
    initialQuantity: string;
    synonyms: string;
    minThreshold: string;
}

export interface ReturnFormData {
    productName: string;
    quantity: string;
    reason: string;
    notes: string;
}

export interface DamageFormData {
    productName: string;
    quantity: string;
    type: string;
    reason: string;
    notes: string;
}

export interface AddStockFormData {
    productName: string;
    quantity: string;
    reason: string;
    supplier: string;
    cost: string;
    notes: string;
}

// دالة SWR fetcher مشتركة
export const fetcher = (url: string) => fetch(url).then(r => r.json());
