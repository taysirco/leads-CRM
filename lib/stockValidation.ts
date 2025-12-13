/**
 * أداة المزامنة والتحقق المسبق من المخزون
 * تمنع Race Conditions وتتحقق من توفر المخزون قبل العمليات
 */

// ========================
// Simple Mutex Implementation
// ========================

class SimpleMutex {
    private locked = false;
    private waitQueue: (() => void)[] = [];

    async acquire(): Promise<() => void> {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                if (!this.locked) {
                    this.locked = true;
                    resolve(() => this.release());
                } else {
                    this.waitQueue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }

    private release(): void {
        this.locked = false;
        const next = this.waitQueue.shift();
        if (next) {
            next();
        }
    }

    isLocked(): boolean {
        return this.locked;
    }
}

// قفل عام لعمليات المخزون
export const stockMutex = new SimpleMutex();

// ========================
// Stock Validation Types
// ========================

export interface ProductQuantity {
    productName: string;
    quantity: number;
    orderId: number;
}

export interface ValidationResult {
    isValid: boolean;
    allAvailable: boolean;
    validProducts: ProductValidation[];
    invalidProducts: ProductValidation[];
    totalProductsChecked: number;
    totalOrdersChecked: number;
}

export interface ProductValidation {
    productName: string;
    requestedQuantity: number;
    availableQuantity: number;
    isAvailable: boolean;
    matchedProductName?: string;
    orders: number[];
    message: string;
}

// ========================
// Validation Function
// ========================

import { fetchStock, findProductBySynonyms } from './googleSheets';

/**
 * التحقق المسبق من توفر المخزون لجميع المنتجات المطلوبة
 * يجب استدعاء هذه الدالة قبل تحديث حالة الطلبات
 */
export async function validateStockAvailability(
    orderItems: ProductQuantity[]
): Promise<ValidationResult> {
    console.log(`🔍 بدء التحقق المسبق من المخزون لـ ${orderItems.length} طلب...`);

    // الخطوة 1: تجميع الكميات المطلوبة حسب المنتج
    const productQuantities = new Map<string, {
        totalQuantity: number;
        orders: number[];
    }>();

    for (const item of orderItems) {
        const normalizedName = item.productName.trim();
        if (!productQuantities.has(normalizedName)) {
            productQuantities.set(normalizedName, {
                totalQuantity: 0,
                orders: []
            });
        }

        const productData = productQuantities.get(normalizedName)!;
        productData.totalQuantity += item.quantity;
        productData.orders.push(item.orderId);
    }

    console.log(`📊 تم تجميع ${productQuantities.size} منتج مختلف للتحقق`);

    // الخطوة 2: جلب المخزون مرة واحدة فقط
    const stockData = await fetchStock(true);
    const stockItems = stockData.stockItems;
    console.log(`📦 تم جلب ${stockItems.length} منتج من المخزون`);

    // الخطوة 3: التحقق من كل منتج
    const validProducts: ProductValidation[] = [];
    const invalidProducts: ProductValidation[] = [];

    for (const [productName, data] of productQuantities.entries()) {
        const stockItem = findProductBySynonyms(productName, stockItems);

        if (!stockItem) {
            // المنتج غير موجود
            invalidProducts.push({
                productName,
                requestedQuantity: data.totalQuantity,
                availableQuantity: 0,
                isAvailable: false,
                orders: data.orders,
                message: `المنتج "${productName}" غير موجود في المخزون`
            });
            console.log(`❌ المنتج "${productName}" غير موجود`);
            continue;
        }

        if (stockItem.currentQuantity < data.totalQuantity) {
            // المخزون غير كافي
            invalidProducts.push({
                productName,
                requestedQuantity: data.totalQuantity,
                availableQuantity: stockItem.currentQuantity,
                isAvailable: false,
                matchedProductName: stockItem.productName,
                orders: data.orders,
                message: `المخزون غير كافي للمنتج "${stockItem.productName}". المتوفر: ${stockItem.currentQuantity}، المطلوب: ${data.totalQuantity}`
            });
            console.log(`⚠️ المخزون غير كافي: "${stockItem.productName}" - متوفر ${stockItem.currentQuantity}، مطلوب ${data.totalQuantity}`);
            continue;
        }

        // المخزون كافي
        validProducts.push({
            productName,
            requestedQuantity: data.totalQuantity,
            availableQuantity: stockItem.currentQuantity,
            isAvailable: true,
            matchedProductName: stockItem.productName,
            orders: data.orders,
            message: `متوفر: ${stockItem.currentQuantity}، سيتبقى: ${stockItem.currentQuantity - data.totalQuantity}`
        });
        console.log(`✅ المخزون كافي: "${stockItem.productName}" - متوفر ${stockItem.currentQuantity}، مطلوب ${data.totalQuantity}`);
    }

    const result: ValidationResult = {
        isValid: invalidProducts.length === 0,
        allAvailable: invalidProducts.length === 0,
        validProducts,
        invalidProducts,
        totalProductsChecked: productQuantities.size,
        totalOrdersChecked: orderItems.length
    };

    console.log(`📊 نتيجة التحقق: ${result.isValid ? '✅ جميع المنتجات متوفرة' : `❌ ${invalidProducts.length} منتج غير متوفر`}`);

    return result;
}

/**
 * دالة مساعدة لإنشاء رسالة خطأ تفصيلية للمنتجات غير المتوفرة
 */
export function formatValidationError(validation: ValidationResult): string {
    if (validation.isValid) {
        return '';
    }

    let message = `❌ لا يمكن إتمام الشحن - المخزون غير كافي:\n\n`;

    for (const product of validation.invalidProducts) {
        message += `• ${product.matchedProductName || product.productName}:\n`;
        message += `  المطلوب: ${product.requestedQuantity} | المتوفر: ${product.availableQuantity}\n`;
        message += `  الطلبات المتأثرة: ${product.orders.join(', ')}\n\n`;
    }

    return message;
}

/**
 * تنفيذ عملية مع قفل المخزون
 */
export async function withStockLock<T>(
    operation: () => Promise<T>
): Promise<T> {
    const release = await stockMutex.acquire();
    console.log('🔒 تم الحصول على قفل المخزون');

    try {
        const result = await operation();
        return result;
    } finally {
        release();
        console.log('🔓 تم تحرير قفل المخزون');
    }
}
