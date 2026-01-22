/**
 * Rate Limiting بسيط في الذاكرة
 * يحمي الـ API من الطلبات الزائدة
 * 
 * ملاحظة: هذا الحل مناسب للتطبيقات الصغيرة والمتوسطة
 * للتطبيقات الكبيرة يُفضل استخدام Redis
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// تخزين الطلبات في الذاكرة
const requests = new Map<string, RateLimitEntry>();

// تنظيف الإدخالات المنتهية كل 5 دقائق
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// تشغيل التنظيف التلقائي
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of requests.entries()) {
            if (now > entry.resetTime) {
                requests.delete(key);
            }
        }
    }, CLEANUP_INTERVAL);
}

/**
 * إعدادات Rate Limit المسبقة
 */
export const RATE_LIMITS = {
    // تسجيل الدخول: 20 محاولة / دقيقة
    LOGIN: { limit: 20, windowMs: 60 * 1000 },
    // API عام: 100 طلب / دقيقة
    API: { limit: 100, windowMs: 60 * 1000 },
    // API ثقيل: 20 طلب / دقيقة
    HEAVY_API: { limit: 20, windowMs: 60 * 1000 },
    // التحديثات: 50 طلب / دقيقة
    UPDATE: { limit: 50, windowMs: 60 * 1000 }
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;

/**
 * التحقق من Rate Limit
 * @param identifier معرف فريد (عادة IP أو user ID)
 * @param limit الحد الأقصى للطلبات
 * @param windowMs نافذة الوقت بالمللي ثانية
 * @returns true إذا كان مسموحاً، false إذا تم تجاوز الحد
 */
export function checkRateLimit(
    identifier: string,
    limit: number,
    windowMs: number
): boolean {
    const now = Date.now();
    const key = identifier;

    const entry = requests.get(key);

    // إذا لم يكن هناك إدخال سابق أو انتهت النافذة
    if (!entry || now > entry.resetTime) {
        requests.set(key, {
            count: 1,
            resetTime: now + windowMs
        });
        return true;
    }

    // زيادة العداد
    entry.count++;

    // التحقق من تجاوز الحد
    if (entry.count > limit) {
        return false;
    }

    return true;
}

/**
 * التحقق من Rate Limit باستخدام إعدادات مسبقة
 * @param identifier معرف فريد
 * @param type نوع الـ Rate Limit
 * @returns true إذا كان مسموحاً
 */
export function checkRateLimitByType(
    identifier: string,
    type: RateLimitType
): boolean {
    const config = RATE_LIMITS[type];
    return checkRateLimit(identifier, config.limit, config.windowMs);
}

/**
 * الحصول على معلومات Rate Limit الحالية
 * @param identifier معرف فريد
 * @returns معلومات الحالة
 */
export function getRateLimitInfo(identifier: string): {
    remaining: number;
    resetTime: number;
    isLimited: boolean;
} | null {
    const entry = requests.get(identifier);

    if (!entry) {
        return null;
    }

    const now = Date.now();
    if (now > entry.resetTime) {
        return null;
    }

    return {
        remaining: Math.max(0, RATE_LIMITS.API.limit - entry.count),
        resetTime: entry.resetTime,
        isLimited: entry.count > RATE_LIMITS.API.limit
    };
}

/**
 * استخراج IP من الطلب
 * @param req طلب Next.js API
 * @returns عنوان IP
 */
export function getClientIP(req: {
    headers: { [key: string]: string | string[] | undefined };
    socket?: { remoteAddress?: string };
}): string {
    // التحقق من headers الشائعة للـ proxies
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
        return ip.trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // الـ IP المباشر
    return req.socket?.remoteAddress || 'unknown';
}

/**
 * إعادة تعيين Rate Limit لمعرف معين
 * @param identifier معرف فريد
 */
export function resetRateLimit(identifier: string): void {
    requests.delete(identifier);
}

/**
 * إعادة تعيين جميع Rate Limits
 */
export function resetAllRateLimits(): void {
    requests.clear();
}
