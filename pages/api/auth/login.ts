import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

const USERNAME = process.env.APP_USERNAME;
const PASSWORD = process.env.APP_PASSWORD;

// تعريف مستخدمي الكول سنتر (يفضل لاحقاً النقل إلى متغيرات بيئة)
const CALL_CENTER_USERS: { username: string; password: string; role: 'agent'; displayName: string }[] = [
  { username: 'heba.', password: '2122', role: 'agent', displayName: 'هبه' },
  { username: 'ahmed.', password: '2211', role: 'agent', displayName: 'احمد' },
  { username: 'raed.', password: '3311', role: 'agent', displayName: 'رائد' }, // بافتراض أن اسم المستخدم لرائد هو raed.
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!USERNAME || !PASSWORD) {
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  // تحقق الأدمن
  if (username === USERNAME && password === PASSWORD) {
    const cookies = [
      serialize('auth_token', 'true', { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'strict', maxAge: 60 * 60 * 24, path: '/' }),
      serialize('user_name', encodeURIComponent(username), { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'strict', maxAge: 60 * 60 * 24, path: '/' }),
      serialize('user_role', 'admin', { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'strict', maxAge: 60 * 60 * 24, path: '/' }),
    ];
    res.setHeader('Set-Cookie', cookies);
    return res.status(200).json({ message: 'Login successful', role: 'admin' });
  }

  // تحقق موظفي الكول سنتر
  const found = CALL_CENTER_USERS.find(u => u.username === username && u.password === password);
  if (found) {
    const cookies = [
      serialize('auth_token', 'true', { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'strict', maxAge: 60 * 60 * 24, path: '/' }),
      serialize('user_name', encodeURIComponent(found.username), { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'strict', maxAge: 60 * 60 * 24, path: '/' }),
      serialize('user_role', found.role, { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'strict', maxAge: 60 * 60 * 24, path: '/' }),
      serialize('user_display_name', encodeURIComponent(found.displayName), { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'strict', maxAge: 60 * 60 * 24, path: '/' }),
    ];
    res.setHeader('Set-Cookie', cookies);
    return res.status(200).json({ message: 'Login successful', role: found.role });
  }

  return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
} 