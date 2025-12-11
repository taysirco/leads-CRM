import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken } from '../../../lib/auth';
import type { UserRole } from '../../../types';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const authToken = req.cookies['auth_token'];

  // التحقق من وجود التوكن
  if (!authToken) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // محاولة التحقق من JWT أولاً
  const jwtPayload = verifyToken(authToken);

  if (jwtPayload) {
    // التوكن JWT صالح - استخدام البيانات منه
    return res.status(200).json({
      role: jwtPayload.role,
      username: jwtPayload.username,
      displayName: jwtPayload.displayName || jwtPayload.username
    });
  }

  // Fallback للتوافق مع التوكنات القديمة (auth_token = 'true')
  // هذا يضمن عدم تسجيل خروج المستخدمين الحاليين
  if (authToken === 'true') {
    const role = (req.cookies['user_role'] || 'admin') as UserRole;
    const username = decodeURIComponent(req.cookies['user_name'] || '');
    const displayName = decodeURIComponent(req.cookies['user_display_name'] || username);

    return res.status(200).json({ role, username, displayName });
  }

  // التوكن غير صالح
  return res.status(401).json({ message: 'Invalid or expired token' });
}