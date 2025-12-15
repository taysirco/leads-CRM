import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { signToken } from '../../../lib/auth';
import { checkRateLimitByType, getClientIP } from '../../../lib/rateLimit';
import type { UserRole } from '../../../types';

const USERNAME = process.env.APP_USERNAME;
const PASSWORD = process.env.APP_PASSWORD;

// تهيئة مستخدمي الكول سنتر من متغير البيئة CALL_CENTER_USERS بصيغة:
// CALL_CENTER_USERS="ahmed.:1234:أحمد,doaa.:2345:دعاء,mai.:3456:مي,nada.:4567:ندي"
function parseCallCenterUsers(envValue?: string) {
  const fallback = [
    { username: 'ahmed.', password: '1234', role: 'agent' as const, displayName: 'أحمد' },
    { username: 'doaa.', password: '2345', role: 'agent' as const, displayName: 'دعاء' },
    { username: 'mai.', password: '3456', role: 'agent' as const, displayName: 'مي' },
    { username: 'nada.', password: '4567', role: 'agent' as const, displayName: 'ندي' },
  ];
  if (!envValue || !envValue.trim()) return fallback;

  try {
    // يدعم الفواصل أو الفواصل المنقوطة كفاصل بين المستخدمين
    const entries = envValue.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    const users = entries.map(entry => {
      const [username, password, displayName] = entry.split(':');
      if (!username || !password) return null;
      return { username: username.trim(), password: password.trim(), role: 'agent' as const, displayName: (displayName || username).trim() };
    }).filter(Boolean) as { username: string; password: string; role: 'agent'; displayName: string }[];
    return users.length > 0 ? users : fallback;
  } catch {
    return fallback;
  }
}

const CALL_CENTER_USERS: { username: string; password: string; role: 'agent'; displayName: string }[] = parseCallCenterUsers(process.env.CALL_CENTER_USERS);

/**
 * إنشاء cookies للمصادقة
 * يستخدم JWT للتوكن الرئيسي مع الحفاظ على الـ cookies الأخرى للتوافق
 */
function createAuthCookies(
  username: string,
  role: UserRole,
  displayName?: string
): string[] {
  const isProduction = process.env.NODE_ENV !== 'development';
  const maxAge = 60 * 60 * 24; // 24 ساعة

  // إنشاء JWT token آمن
  const jwtToken = signToken({ username, role, displayName });

  const cookies = [
    // التوكن الرئيسي - الآن JWT بدلاً من 'true'
    serialize('auth_token', jwtToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge,
      path: '/'
    }),
    // الحفاظ على user_name للتوافق مع الكود الحالي
    serialize('user_name', encodeURIComponent(username), {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge,
      path: '/'
    }),
    // الحفاظ على user_role للتوافق مع الكود الحالي
    serialize('user_role', role, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge,
      path: '/'
    }),
  ];

  // إضافة display_name للموظفين
  if (displayName) {
    cookies.push(
      serialize('user_display_name', encodeURIComponent(displayName), {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge,
        path: '/'
      })
    );
  }

  return cookies;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // التحقق من إعداد المتغيرات البيئية
  if (!USERNAME || !PASSWORD) {
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  // السماح فقط بـ POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Rate Limiting - حماية من محاولات تسجيل الدخول المتكررة
  const clientIP = getClientIP(req);
  if (!checkRateLimitByType(clientIP, 'LOGIN')) {
    console.log(`⚠️ Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({
      message: 'تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. يرجى الانتظار دقيقة واحدة.'
    });
  }

  const { username, password } = req.body || {};

  // التحقق من وجود البيانات
  if (!username || !password) {
    return res.status(400).json({ message: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  // تحقق الأدمن
  if (username === USERNAME && password === PASSWORD) {
    console.log(`✅ Admin login successful: ${username}`);
    const cookies = createAuthCookies(username, 'admin');
    res.setHeader('Set-Cookie', cookies);
    return res.status(200).json({ message: 'Login successful', role: 'admin' });
  }

  // تحقق موظفي الكول سنتر
  const found = CALL_CENTER_USERS.find(u => u.username === username && u.password === password);
  if (found) {
    console.log(`✅ Agent login successful: ${found.username}`);
    const cookies = createAuthCookies(found.username, found.role, found.displayName);
    res.setHeader('Set-Cookie', cookies);
    return res.status(200).json({ message: 'Login successful', role: found.role });
  }

  // فشل تسجيل الدخول
  console.log(`❌ Login failed for: ${username} from IP: ${clientIP}`);
  return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
}