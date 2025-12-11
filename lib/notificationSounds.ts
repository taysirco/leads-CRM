/**
 * نظام الأصوات الاحترافي للإشعارات
 * Professional Notification Sound System
 * 
 * يستخدم Web Audio API لإنشاء أصوات طبيعية وممتعة
 * بدلاً من أصوات البيب الإلكترونية المزعجة
 */

// أنواع الأصوات المتاحة
export type SoundType =
    | 'newOrder'    // صوت كاشير - للطلبات الجديدة 💰
    | 'success'     // صوت نجاح ناعم ✅
    | 'warning'     // صوت تنبيه ⚠️
    | 'error'       // صوت خطأ ❌
    | 'critical'    // صوت عاجل 🚨
    | 'message'     // صوت رسالة بسيط 📩
    | 'pop'         // صوت فقاعة خفيف
    | 'chime';      // صوت جرس لطيف

// إعدادات الصوت
interface SoundConfig {
    volume: number;      // 0.0 - 1.0
    enabled: boolean;
    muted: boolean;
}

// حالة النظام
let audioContext: AudioContext | null = null;
let globalVolume = 0.5;
let isMuted = false;
let isInitialized = false;

/**
 * تهيئة نظام الصوت (يجب استدعاؤها بعد تفاعل المستخدم)
 */
export const initAudioSystem = (): boolean => {
    if (isInitialized && audioContext) return true;

    try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        isInitialized = true;
        console.log('🔊 تم تهيئة نظام الصوت بنجاح');
        return true;
    } catch (error) {
        console.error('❌ فشل في تهيئة نظام الصوت:', error);
        return false;
    }
};

/**
 * ضبط مستوى الصوت العام
 */
export const setGlobalVolume = (volume: number): void => {
    globalVolume = Math.max(0, Math.min(1, volume));
    console.log(`🔊 مستوى الصوت: ${Math.round(globalVolume * 100)}%`);
};

/**
 * الحصول على مستوى الصوت الحالي
 */
export const getGlobalVolume = (): number => globalVolume;

/**
 * كتم/إلغاء كتم الصوت
 */
export const toggleMute = (): boolean => {
    isMuted = !isMuted;
    console.log(isMuted ? '🔇 تم كتم الصوت' : '🔊 تم إلغاء كتم الصوت');
    return isMuted;
};

/**
 * تعيين حالة الكتم
 */
export const setMuted = (muted: boolean): void => {
    isMuted = muted;
};

/**
 * التحقق من حالة الكتم
 */
export const isSoundMuted = (): boolean => isMuted;

/**
 * إنشاء نغمة موسيقية طبيعية
 */
const createTone = (
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine'
): { oscillator: OscillatorNode; gainNode: GainNode } => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.type = type;

    // تأثير fade in/out لجعل الصوت أكثر نعومة
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(volume * 0.8, startTime + duration * 0.7);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    return { oscillator, gainNode };
};

/**
 * صوت الطلب الجديد - صوت كاشير ممتع 💰
 * نغمة صاعدة مبهجة تشبه صوت البيع
 */
const playNewOrderSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    // نغمة C major chord صاعدة
    const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const durations = [0.15, 0.15, 0.15, 0.3];

    let delay = 0;
    frequencies.forEach((freq, i) => {
        createTone(ctx, freq, now + delay, durations[i], volume * 0.3, 'sine');
        // إضافة هارمونيك للغنى
        createTone(ctx, freq * 2, now + delay, durations[i] * 0.8, volume * 0.1, 'sine');
        delay += durations[i] * 0.6;
    });

    // إضافة صوت "كاشير" خفيف
    setTimeout(() => {
        createTone(ctx, 1200, ctx.currentTime, 0.08, volume * 0.15, 'square');
    }, 400);
};

/**
 * صوت النجاح - نغمة إيجابية ناعمة ✅
 */
const playSuccessSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    // نغمة صاعدة بسيطة (perfect fifth)
    createTone(ctx, 440, now, 0.15, volume * 0.25, 'sine');        // A4
    createTone(ctx, 554.37, now + 0.1, 0.15, volume * 0.3, 'sine'); // C#5
    createTone(ctx, 659.25, now + 0.2, 0.25, volume * 0.35, 'sine'); // E5

    // هارمونيك خفيف
    createTone(ctx, 880, now + 0.2, 0.2, volume * 0.1, 'sine');
};

/**
 * صوت التحذير - نغمة تنبيه واضحة ⚠️
 */
const playWarningSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    // نغمتان متناوبتان
    createTone(ctx, 440, now, 0.2, volume * 0.3, 'triangle');
    createTone(ctx, 349.23, now + 0.25, 0.2, volume * 0.3, 'triangle');
    createTone(ctx, 440, now + 0.5, 0.15, volume * 0.25, 'triangle');
};

/**
 * صوت الخطأ - نغمة هابطة ❌
 */
const playErrorSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    // نغمة هابطة (minor second - توتر)
    createTone(ctx, 400, now, 0.15, volume * 0.3, 'sawtooth');
    createTone(ctx, 350, now + 0.15, 0.15, volume * 0.25, 'sawtooth');
    createTone(ctx, 300, now + 0.3, 0.25, volume * 0.2, 'sawtooth');
};

/**
 * صوت حرج - إنذار عاجل 🚨
 */
const playCriticalSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    // تكرار سريع للتنبيه
    for (let i = 0; i < 3; i++) {
        const offset = i * 0.3;
        createTone(ctx, 880, now + offset, 0.1, volume * 0.35, 'square');
        createTone(ctx, 698.46, now + offset + 0.12, 0.1, volume * 0.35, 'square');
    }

    // نغمة ختامية مؤكدة
    createTone(ctx, 1046.50, now + 0.9, 0.2, volume * 0.3, 'sine');
};

/**
 * صوت رسالة - نغمة خفيفة 📩
 */
const playMessageSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    // نغمة بسيطة وخفيفة
    createTone(ctx, 587.33, now, 0.12, volume * 0.2, 'sine'); // D5
    createTone(ctx, 783.99, now + 0.08, 0.15, volume * 0.25, 'sine'); // G5
};

/**
 * صوت فقاعة - خفيف جداً
 */
const playPopSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    createTone(ctx, 600, now, 0.08, volume * 0.15, 'sine');

    // إضافة تأثير "pop"
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(800, now);
    oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.05);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume * 0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    oscillator.start(now);
    oscillator.stop(now + 0.05);
};

/**
 * صوت جرس - لطيف ومميز 🔔
 */
const playChimeSound = (ctx: AudioContext, volume: number): void => {
    const now = ctx.currentTime;

    // جرس بتردد عالي مع تلاشي طبيعي
    const frequencies = [1046.50, 1318.51, 1567.98]; // C6, E6, G6

    frequencies.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(freq, now);
        oscillator.type = 'sine';

        const startTime = now + (i * 0.05);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume * 0.2, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.8);
    });
};

/**
 * تشغيل صوت الإشعار
 * الدالة الرئيسية لتشغيل الأصوات
 */
export const playNotificationSound = (
    soundType: SoundType,
    customVolume?: number
): boolean => {
    // التحقق من الشروط
    if (isMuted) {
        console.log('🔇 الصوت مكتوم');
        return false;
    }

    // تهيئة النظام إذا لم يكن جاهزاً
    if (!audioContext || audioContext.state === 'closed') {
        if (!initAudioSystem()) {
            return false;
        }
    }

    // استئناف السياق إذا كان معلقاً
    if (audioContext!.state === 'suspended') {
        audioContext!.resume();
    }

    const volume = (customVolume ?? globalVolume);
    const ctx = audioContext!;

    try {
        switch (soundType) {
            case 'newOrder':
                playNewOrderSound(ctx, volume);
                console.log('🔊 ▶️ صوت طلب جديد');
                break;
            case 'success':
                playSuccessSound(ctx, volume);
                console.log('🔊 ▶️ صوت نجاح');
                break;
            case 'warning':
                playWarningSound(ctx, volume);
                console.log('🔊 ▶️ صوت تحذير');
                break;
            case 'error':
                playErrorSound(ctx, volume);
                console.log('🔊 ▶️ صوت خطأ');
                break;
            case 'critical':
                playCriticalSound(ctx, volume);
                console.log('🔊 ▶️ صوت حرج');
                break;
            case 'message':
                playMessageSound(ctx, volume);
                console.log('🔊 ▶️ صوت رسالة');
                break;
            case 'pop':
                playPopSound(ctx, volume);
                console.log('🔊 ▶️ صوت فقاعة');
                break;
            case 'chime':
                playChimeSound(ctx, volume);
                console.log('🔊 ▶️ صوت جرس');
                break;
            default:
                playMessageSound(ctx, volume);
        }
        return true;
    } catch (error) {
        console.error('❌ خطأ في تشغيل الصوت:', error);
        return false;
    }
};

/**
 * تشغيل صوت بناءً على نوع الإشعار وأولويته
 */
export const playNotificationAudioByType = (
    notificationType: string,
    priority: 'low' | 'normal' | 'high' | 'critical'
): boolean => {
    // تحديد الصوت المناسب
    let soundType: SoundType;

    switch (notificationType) {
        case 'new_order':
            soundType = 'newOrder';
            break;
        case 'success':
            soundType = 'success';
            break;
        case 'warning':
            soundType = 'warning';
            break;
        case 'error':
            soundType = 'error';
            break;
        case 'stock_alert':
            soundType = priority === 'critical' ? 'critical' : 'warning';
            break;
        case 'info':
        case 'order_update':
            soundType = 'message';
            break;
        case 'system':
            soundType = 'chime';
            break;
        default:
            // استخدام الأولوية لتحديد الصوت
            switch (priority) {
                case 'critical':
                    soundType = 'critical';
                    break;
                case 'high':
                    soundType = 'warning';
                    break;
                case 'normal':
                    soundType = 'message';
                    break;
                case 'low':
                    soundType = 'pop';
                    break;
                default:
                    soundType = 'message';
            }
    }

    return playNotificationSound(soundType);
};

/**
 * تهيئة مسبقة للنظام (يستدعى عند أول تفاعل)
 */
export const preloadSounds = (): void => {
    if (initAudioSystem() && audioContext) {
        // تشغيل صوت صامت لتهيئة النظام
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.001);
        console.log('🔊 تم تحميل نظام الصوت مسبقاً');
    }
};

/**
 * اختبار جميع الأصوات
 */
export const testAllSounds = async (): Promise<void> => {
    const sounds: SoundType[] = ['newOrder', 'success', 'warning', 'error', 'critical', 'message', 'pop', 'chime'];

    console.log('🔊 بدء اختبار الأصوات...');

    for (const sound of sounds) {
        console.log(`▶️ جاري تشغيل: ${sound}`);
        playNotificationSound(sound);
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log('✅ انتهى اختبار الأصوات');
};
