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

// ========================
// Atomic Shipping Operation
// ========================

import { updateLead, updateLeadsBatch, deductStockBulk, fetchLeads } from './googleSheets';

export interface AtomicShippingResult {
    success: boolean;
    message: string;
    shippedOrders: number[];
    failedOrders: number[];
    revertedOrders: number[];
    stockResults: any[];
    stockSummary?: any;
}

/**
 * ✨ عملية شحن ذرية آمنة - تمنع Race Conditions
 * الترتيب الصحيح: خصم المخزون أولاً، ثم تحديث حالة الطلبات
 * هذا يضمن عدم تحديث الطلبات إذا فشل خصم المخزون
 */
export async function atomicBulkShipping(
    orderIds: number[]
): Promise<AtomicShippingResult> {
    const release = await stockMutex.acquire();
    console.log('🔒 [ATOMIC] تم الحصول على قفل المخزون للشحن الذري');

    const shippedOrders: number[] = [];
    const failedOrders: number[] = [];
    const revertedOrders: number[] = [];
    let stockResults: any[] = [];
    let stockSummary: any = null;

    try {
        console.log(`📦 [ATOMIC] بدء عملية الشحن الذري لـ ${orderIds.length} طلب...`);

        // الخطوة 1: جلب بيانات الطلبات
        console.log('📋 [ATOMIC] الخطوة 1: جلب بيانات الطلبات...');
        const leads = await fetchLeads();
        const orderItems: Array<{ productName: string; quantity: number; orderId: number; rowIndex: number; originalStatus: string }> = [];
        const skipStockOrders: Array<{ orderId: number; rowIndex: number }> = []; // 📝 طلبات يدوية بدون بيانات منتج — أرشفة مباشرة
        const orderStatusMap = new Map<number, { rowIndex: number; status: string }>();

        for (const orderId of orderIds) {
            const targetLead = leads.find(lead => lead.id === Number(orderId));

            // ❌ الطلب غير موجود في النظام
            if (!targetLead) {
                console.error(`❌ [ATOMIC] الطلب ${orderId} غير موجود في النظام`);
                failedOrders.push(orderId);
                stockResults.push({
                    orderId,
                    success: false,
                    message: 'الطلب غير موجود في النظام'
                });
                continue;
            }

            // 🛡️ حماية من الخصم المزدوج — تخطي الطلبات المشحونة مسبقاً
            if ((targetLead.status || '').trim() === 'تم الشحن') {
                console.log(`⚠️ [ATOMIC GUARD] الطلب ${orderId} مشحون مسبقاً — تخطي خصم المخزون`);
                shippedOrders.push(orderId);
                stockResults.push({
                    orderId,
                    success: true,
                    message: 'مشحون مسبقاً — لم يتم خصم المخزون مرة أخرى'
                });
                continue;
            }

            // ✅ طلب كامل البيانات — يمر بخصم المخزون
            if (targetLead.productName?.trim() && targetLead.quantity?.toString().trim()) {
                const quantity = parseInt(targetLead.quantity) || 1;
                orderItems.push({
                    productName: targetLead.productName.trim(),
                    quantity,
                    orderId: targetLead.id,
                    rowIndex: targetLead.rowIndex,
                    originalStatus: targetLead.status || 'تم التأكيد'
                });
                orderStatusMap.set(targetLead.id, { rowIndex: targetLead.rowIndex, status: targetLead.status || 'تم التأكيد' });
            } else {
                // 📝 طلب يدوي بدون بيانات المنتج — أرشفة مباشرة بدون خصم مخزون
                console.log(`📝 [ATOMIC] الطلب ${orderId} — بيانات المنتج غير مكتملة (المنتج: "${targetLead.productName || ''}", الكمية: "${targetLead.quantity || ''}") — سيتم أرشفته مباشرة بدون خصم مخزون`);
                skipStockOrders.push({ orderId: targetLead.id, rowIndex: targetLead.rowIndex });
                stockResults.push({
                    orderId,
                    success: true,
                    message: 'أرشفة مباشرة — بدون خصم مخزون (بيانات المنتج غير مكتملة)'
                });
            }
        }

        // التحقق: هل يوجد طلبات تحتاج معالجة؟
        if (orderItems.length === 0 && skipStockOrders.length === 0) {
            // 🛡️ إذا كانت جميع الطلبات مشحونة مسبقاً — نعتبرها نجاح
            if (shippedOrders.length > 0) {
                console.log(`✅ [ATOMIC] جميع الطلبات (${shippedOrders.length}) مشحونة مسبقاً — لا حاجة لخصم إضافي`);
                return {
                    success: true,
                    message: `جميع الطلبات مشحونة مسبقاً (${shippedOrders.length} طلب) — لم يتم خصم المخزون مجدداً`,
                    shippedOrders,
                    failedOrders,
                    revertedOrders: [],
                    stockResults
                };
            }
            return {
                success: false,
                message: 'لا توجد طلبات صالحة للشحن',
                shippedOrders: [],
                failedOrders: orderIds,
                revertedOrders: [],
                stockResults
            };
        }

        // ✨ معالجة الطلبات اليدوية (بدون خصم مخزون) — أرشفة مباشرة
        if (skipStockOrders.length > 0) {
            console.log(`📝 [ATOMIC] أرشفة ${skipStockOrders.length} طلب يدوي مباشرة (بدون خصم مخزون)...`);
            try {
                const skipBatchUpdates = skipStockOrders.map(item => ({
                    rowNumber: item.rowIndex,
                    updates: { status: 'تم الشحن' }
                }));
                await updateLeadsBatch(skipBatchUpdates);
                for (const item of skipStockOrders) {
                    shippedOrders.push(item.orderId);
                }
                console.log(`✅ [ATOMIC] تم أرشفة ${skipStockOrders.length} طلب يدوي بنجاح`);
            } catch (skipError: any) {
                console.error(`❌ [ATOMIC] فشل أرشفة الطلبات اليدوية:`, skipError);
                // محاولة فردية كخطة بديلة
                for (const item of skipStockOrders) {
                    try {
                        await updateLead(item.rowIndex, { status: 'تم الشحن' });
                        shippedOrders.push(item.orderId);
                    } catch (e) {
                        console.error(`❌ [ATOMIC] فشل أرشفة الطلب اليدوي ${item.orderId}:`, e);
                        failedOrders.push(item.orderId);
                    }
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }

        // إذا لم يتبقَ طلبات تحتاج خصم مخزون، ننتهي هنا
        if (orderItems.length === 0) {
            console.log(`✅ [ATOMIC] لا توجد طلبات تحتاج خصم مخزون — تمت الأرشفة`);
            return {
                success: failedOrders.length === 0,
                message: `✅ تم أرشفة ${shippedOrders.length} طلب بنجاح (بدون خصم مخزون)`,
                shippedOrders,
                failedOrders,
                revertedOrders: [],
                stockResults
            };
        }

        // الخطوة 2: التحقق من المخزون داخل القفل
        console.log('🔍 [ATOMIC] الخطوة 2: التحقق من توفر المخزون...');
        const validation = await validateStockAvailability(orderItems);

        if (!validation.isValid) {
            console.log('❌ [ATOMIC] المخزون غير كافي - لن يتم تحديث أي طلب');
            
            // تحديد الطلبات التي ستفشل
            for (const invalidProduct of validation.invalidProducts) {
                for (const orderId of invalidProduct.orders) {
                    if (!failedOrders.includes(orderId)) {
                        failedOrders.push(orderId);
                    }
                    stockResults.push({
                        orderId,
                        productName: invalidProduct.productName,
                        success: false,
                        message: invalidProduct.message,
                        availableQuantity: invalidProduct.availableQuantity
                    });
                }
            }

            return {
                success: false,
                message: formatValidationError(validation),
                shippedOrders,
                failedOrders,
                revertedOrders: [],
                stockResults
            };
        }

        console.log('✅ [ATOMIC] التحقق من المخزون نجح');

        // ✨ الخطوة 3: خصم المخزون أولاً (قبل تحديث حالة الطلبات)
        console.log('📦 [ATOMIC] الخطوة 3: خصم المخزون...');
        
        const bulkResult = await deductStockBulkWithoutLock(orderItems);
        // دمج نتائج المخزون مع نتائج الطلبات اليدوية السابقة
        const skipStockResults = stockResults.filter(r => r.message?.includes('أرشفة مباشرة') || r.message?.includes('مشحون مسبقاً'));
        stockResults = [...skipStockResults, ...bulkResult.results];
        stockSummary = bulkResult.summary;

        // التحقق من نجاح خصم المخزون
        const successfulDeductions = bulkResult.results.filter((r: any) => r.success);
        const failedDeductions = bulkResult.results.filter((r: any) => !r.success);

        if (failedDeductions.length > 0) {
            console.log(`❌ [ATOMIC] فشل خصم المخزون لـ ${failedDeductions.length} طلب - لن يتم تحديث أي طلب`);
            
            // إضافة الطلبات الفاشلة
            for (const failed of failedDeductions) {
                if (!failedOrders.includes(failed.orderId)) {
                    failedOrders.push(failed.orderId);
                }
            }

            return {
                success: false,
                message: `فشل في خصم المخزون`,
                shippedOrders,
                failedOrders,
                revertedOrders: [],
                stockResults,
                stockSummary
            };
        }

        console.log(`✅ [ATOMIC] تم خصم المخزون بنجاح لـ ${successfulDeductions.length} طلب`);

        // ✨ الخطوة 4: تحديث حالة الطلبات إلى "تم الشحن" دفعة واحدة (طلب API واحد!)
        console.log('🔄 [ATOMIC] الخطوة 4: تحديث حالة الطلبات دفعة واحدة...');
        
        try {
            // إعداد التحديثات المجمعة
            const batchUpdates = orderItems.map(item => ({
                rowNumber: item.rowIndex,
                updates: { status: 'تم الشحن' }
            }));

            // تحديث جميع الطلبات دفعة واحدة
            await updateLeadsBatch(batchUpdates);
            
            // جميع الطلبات نجحت
            for (const item of orderItems) {
                shippedOrders.push(item.orderId);
            }
            console.log(`✅ [ATOMIC] تم تحديث ${orderItems.length} طلب إلى "تم الشحن" دفعة واحدة`);
            
        } catch (batchUpdateError: any) {
            console.error('❌ [ATOMIC] فشل التحديث المجمع:', batchUpdateError);
            // في حالة فشل التحديث المجمع، نحاول التحديث الفردي كخطة بديلة
            console.log('🔄 [ATOMIC] محاولة التحديث الفردي كخطة بديلة...');
            
            for (const item of orderItems) {
                try {
                    await updateLead(item.rowIndex, { status: 'تم الشحن' });
                    shippedOrders.push(item.orderId);
                } catch (updateError) {
                    console.error(`❌ [ATOMIC] فشل تحديث الطلب ${item.orderId}:`, updateError);
                    failedOrders.push(item.orderId);
                }
                // تأخير صغير لتجنب تجاوز الحد
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        const allSuccess = failedOrders.length === 0;
        const message = allSuccess
            ? `✅ تم شحن ${shippedOrders.length} طلب بنجاح`
            : `⚠️ تم شحن ${shippedOrders.length} من ${orderIds.length} طلب. فشل ${failedOrders.length} طلب.`;

        console.log(`📊 [ATOMIC] ${message}`);

        return {
            success: allSuccess,
            message,
            shippedOrders,
            failedOrders,
            revertedOrders,
            stockResults,
            stockSummary
        };

    } catch (error: any) {
        console.error('❌ [ATOMIC] خطأ في عملية الشحن الذري:', error);
        return {
            success: false,
            message: `خطأ في النظام: ${error?.message || error}`,
            shippedOrders: [],
            failedOrders: orderIds,
            revertedOrders: [],
            stockResults: orderIds.map(id => ({
                orderId: id,
                success: false,
                message: `خطأ في النظام: ${error?.message || 'خطأ غير معروف'}`
            }))
        };
    } finally {
        release();
        console.log('🔓 [ATOMIC] تم تحرير قفل المخزون');
    }
}

/**
 * خصم المخزون الجماعي بدون قفل (للاستخدام داخل عملية مقفلة مسبقاً)
 */
async function deductStockBulkWithoutLock(
    orderItems: Array<{ productName: string; quantity: number; orderId: number }>
): Promise<{ success: boolean; results: any[]; summary?: any }> {
    try {
        // ✨ استخدام skipLock لتجنب Deadlock لأننا داخل قفل بالفعل
        const result = await deductStockBulk(orderItems, { skipLock: true });
        return result;
    } catch (error) {
        return {
            success: false,
            results: orderItems.map(item => ({
                orderId: item.orderId,
                productName: item.productName,
                quantity: item.quantity,
                success: false,
                message: 'خطأ في خصم المخزون'
            }))
        };
    }
}
