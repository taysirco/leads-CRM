import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

const USERNAME = process.env.APP_USERNAME;
const PASSWORD = process.env.APP_PASSWORD;

if (!USERNAME || !PASSWORD) {
  throw new Error('Username or password is not set in environment variables');
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { username, password } = req.body;

  if (username === USERNAME && password === PASSWORD) {
    // Correct credentials
    const cookie = serialize('auth_token', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });
    res.setHeader('Set-Cookie', cookie);
    return res.status(200).json({ message: 'Login successful' });
  } else {
    // Incorrect credentials
    return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
} 