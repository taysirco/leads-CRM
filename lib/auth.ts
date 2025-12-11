/**
 * مكتبة المصادقة باستخدام JWT
 * توفر دوال آمنة لإنشاء والتحقق من التوكنات
 */

import jwt from 'jsonwebtoken';
import type { UserPayload } from '../types';

// الحصول على المفتاح السري من متغيرات البيئة
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

// مدة صلاحية التوكن (24 ساعة)
const TOKEN_EXPIRY = '24h';

/**
 * إنشاء توكن JWT جديد
 * @param payload بيانات المستخدم
 * @returns التوكن المشفر
 */
export function signToken(payload: Omit<UserPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * التحقق من صحة التوكن وفك تشفيره
 * @param token التوكن للتحقق منه
 * @returns بيانات المستخدم أو null إذا كان التوكن غير صالح
 */
export function verifyToken(token: string): UserPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
        return decoded;
    } catch (error) {
        // التوكن منتهي الصلاحية أو غير صالح
        return null;
    }
}

/**
 * فك تشفير التوكن بدون التحقق من الصلاحية
 * مفيد للحصول على معلومات حتى لو انتهت الصلاحية
 * @param token التوكن
 * @returns بيانات المستخدم أو null
 */
export function decodeToken(token: string): UserPayload | null {
    try {
        const decoded = jwt.decode(token) as UserPayload;
        return decoded;
    } catch {
        return null;
    }
}

/**
 * التحقق مما إذا كان التوكن على وشك الانتهاء
 * @param token التوكن
 * @param thresholdMinutes عدد الدقائق قبل الانتهاء
 * @returns true إذا كان التوكن على وشك الانتهاء
 */
export function isTokenExpiringSoon(token: string, thresholdMinutes: number = 30): boolean {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    const expiryTime = decoded.exp * 1000; // تحويل إلى milliseconds
    const thresholdMs = thresholdMinutes * 60 * 1000;

    return Date.now() > (expiryTime - thresholdMs);
}

/**
 * تجديد التوكن إذا كان صالحاً
 * @param token التوكن الحالي
 * @returns توكن جديد أو null إذا كان التوكن غير صالح
 */
export function refreshToken(token: string): string | null {
    const payload = verifyToken(token);
    if (!payload) return null;

    // إنشاء توكن جديد بنفس البيانات
    return signToken({
        username: payload.username,
        role: payload.role,
        displayName: payload.displayName
    });
}

/**
 * استخراج التوكن من header Authorization
 * @param authHeader قيمة Authorization header
 * @returns التوكن أو null
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    // دعم صيغة "Bearer TOKEN"
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    return authHeader;
}
