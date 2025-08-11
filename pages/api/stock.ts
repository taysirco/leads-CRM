import { NextApiRequest, NextApiResponse } from 'next';
import {
  fetchStock,
  addOrUpdateStockItem,
  addDailyReturn,
  deductStock,
  addStockMovement,
  getStockAlerts,
  getStockReports,
  getStockMovements,
  findProductBySynonyms,
  testStockSheetConnection,
  diagnoseGoogleSheets
} from '../../lib/googleSheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // التحقق من صلاحيات الأدمن
  const role = req.cookies['user_role'] || 'guest';
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res);
      case 'PUT':
        return await handlePut(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Stock API error:', error);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// GET: جلب المخزون والتقارير مع دعم فرض التحديث
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { action, force } = req.query;
  const forceRefresh = force === 'true';
  
  console.log(`📡 Stock API GET: action=${action}, force=${forceRefresh}`);

  switch (action) {
    case 'items':
      console.log('📦 جلب بيانات المخزون...');
      if (forceRefresh) {
        console.log('🔄 فرض تحديث البيانات من Google Sheets...');
      }
      const stockData = await fetchStock(forceRefresh);
      console.log(`📊 تم جلب ${stockData.stockItems?.length || 0} منتج`);
      return res.status(200).json(stockData);

    case 'alerts':
      console.log('⚠️ جلب تنبيهات المخزون...');
      const alerts = await getStockAlerts();
      console.log(`🚨 عدد التنبيهات: ${alerts?.length || 0}`);
      return res.status(200).json({ alerts });

    case 'reports':
      console.log('📊 جلب تقارير المخزون...');
      if (forceRefresh) {
        console.log('🔄 فرض تحديث التقارير من Google Sheets...');
      }
      const reports = await getStockReports(); // No forceRefresh argument here, handled internally by getStockReports
      console.log('📈 تم إنشاء التقارير');
      return res.status(200).json({ reports });

    case 'movements':
      console.log('📋 جلب حركات المخزون...');
      try {
        const movements = await getStockMovements();
        return res.status(200).json({ movements });
      } catch (error) {
        console.error('خطأ في جلب حركات المخزون:', error);
        return res.status(500).json({ error: 'فشل في جلب حركات المخزون' });
      }

    case 'test':
      console.log('🧪 اختبار اتصال المخزون...');
      const testResult = await testStockSheetConnection();
      return res.status(200).json({ testResult });

    case 'diagnose':
      console.log('🩺 تشخيص شامل لـ Google Sheets...');
      const diagnoseResult = await diagnoseGoogleSheets();
      return res.status(200).json({ diagnoseResult });

    default:
      return res.status(400).json({ error: 'Invalid action parameter' });
  }
}

// دوال مساعدة لمعالجة العمليات
async function addStockItem(data: any) {
  const { productName, initialQuantity, synonyms, minThreshold } = data;
  
  if (!productName || !productName.trim()) {
    throw new Error('اسم المنتج مطلوب');
  }
  
  if (initialQuantity === undefined || initialQuantity < 0) {
    throw new Error('الكمية الأولية يجب أن تكون صفر أو أكثر');
  }

  const parsedInitialQuantity = parseInt(initialQuantity);
  const parsedMinThreshold = parseInt(minThreshold) || 10;
  
  if (parsedMinThreshold < 0) {
    throw new Error('الحد الأدنى لا يمكن أن يكون سالباً');
  }
  
  if (parsedMinThreshold > parsedInitialQuantity) {
    throw new Error('الحد الأدنى لا يمكن أن يكون أكبر من الكمية الأولية');
  }

  console.log(`📦 إضافة منتج جديد: ${productName.trim()}, كمية: ${parsedInitialQuantity}`);

  await addOrUpdateStockItem({
    productName: productName.trim(),
    initialQuantity: parsedInitialQuantity,
    currentQuantity: parsedInitialQuantity, // الكمية الحالية = الأولية عند الإضافة
    synonyms: synonyms?.trim() || '',
    minThreshold: parsedMinThreshold
  });

  return { 
    success: true, 
    message: `تم إضافة ${productName.trim()} بكمية ${parsedInitialQuantity} بنجاح` 
  };
}

async function addStock(stockData: any) {
  const { productName, quantity, reason, supplier, cost, notes, date } = stockData;
  
  if (!productName || !productName.trim()) {
    throw new Error('اسم المنتج مطلوب');
  }
  
  const addQuantity = parseInt(quantity);
  if (isNaN(addQuantity) || addQuantity <= 0) {
    throw new Error('الكمية يجب أن تكون أكبر من صفر');
  }

  console.log(`📈 إضافة مخزون: ${addQuantity} إلى ${productName}`);

  // التحقق من وجود المنتج
  const stockDataResult = await fetchStock(true);
  const product = findProductBySynonyms(productName, stockDataResult.stockItems);
  
  if (!product) {
    throw new Error('المنتج غير موجود في المخزون');
  }

  console.log(`📊 المخزون قبل الإضافة: ${product.currentQuantity}`);
  
  const newQuantity = product.currentQuantity + addQuantity;
  
  // تحديث المخزون
  await addOrUpdateStockItem({
    ...product,
    currentQuantity: newQuantity
  });

  // تسجيل حركة الإضافة
  await addStockMovement({
    productName: product.productName,
    type: 'add_stock',
    quantity: addQuantity,
    reason: reason || 'إضافة مخزون جديد',
    supplier: supplier || '',
    cost: parseFloat(cost) || 0,
    notes: notes || '',
    date: date || new Date().toISOString().split('T')[0]
  });

  console.log(`📊 المخزون بعد الإضافة: ${newQuantity}`);
  
  return { 
    success: true, 
    message: `تم إضافة ${addQuantity} إلى مخزون ${product.productName}` 
  };
}

async function addReturn(returnData: any) {
  if (!returnData.productName || !returnData.productName.trim()) {
    throw new Error('اسم المنتج مطلوب للمرتجع');
  }
  
  const returnQuantity = parseInt(returnData.quantity);
  if (isNaN(returnQuantity) || returnQuantity <= 0) {
    throw new Error('كمية المرتجع يجب أن تكون أكبر من صفر');
  }

  console.log(`📦 تسجيل مرتجع: ${returnQuantity} من ${returnData.productName}`);

  // التحقق من وجود المنتج
  const stockDataForReturn = await fetchStock(true);
  const productForReturn = findProductBySynonyms(returnData.productName, stockDataForReturn.stockItems);
  
  if (!productForReturn) {
    throw new Error('المنتج غير موجود في المخزون');
  }

  console.log(`📊 المخزون قبل المرتجع: ${productForReturn.currentQuantity}`);
  
  await addDailyReturn({
    productName: returnData.productName,
    quantity: returnQuantity,
    reason: returnData.reason || 'other',
    notes: returnData.notes || '',
    date: returnData.date || new Date().toISOString().split('T')[0]
  });
  
  const newQuantityAfterReturn = productForReturn.currentQuantity + returnQuantity;
  console.log(`📊 المخزون بعد المرتجع: ${newQuantityAfterReturn}`);
  
  return { 
    success: true, 
    message: `تم تسجيل مرتجع ${returnQuantity} من ${returnData.productName}` 
  };
}

async function addDamage(damageData: any) {
  if (!damageData.productName || !damageData.productName.trim()) {
    throw new Error('اسم المنتج مطلوب للتالف');
  }
  
  const damageQuantity = parseInt(damageData.quantity);
  if (isNaN(damageQuantity) || damageQuantity <= 0) {
    throw new Error('كمية التالف يجب أن تكون أكبر من صفر');
  }

  console.log(`💥 تسجيل تالف: ${damageQuantity} من ${damageData.productName}`);

  // التحقق من وجود المنتج وكفاية المخزون
  const stockDataForDamage = await fetchStock(true);
  const productForDamage = findProductBySynonyms(damageData.productName, stockDataForDamage.stockItems);
  
  if (!productForDamage) {
    throw new Error('المنتج غير موجود في المخزون');
  }

  if (productForDamage.currentQuantity < damageQuantity) {
    throw new Error(`المخزون غير كافي. المتوفر: ${productForDamage.currentQuantity}, المطلوب: ${damageQuantity}`);
  }

  console.log(`📊 المخزون قبل التالف: ${productForDamage.currentQuantity}`);

  const newQuantityAfterDamage = Math.max(0, productForDamage.currentQuantity - damageQuantity);
  
  await addOrUpdateStockItem({
    ...productForDamage,
    currentQuantity: newQuantityAfterDamage
  });

  // تسجيل حركة التالف
  await addStockMovement({
    productName: productForDamage.productName,
    type: damageData.type || 'damage',
    quantity: -damageQuantity, // سالب لأنه خصم
    reason: damageData.reason || 'تالف',
    notes: damageData.notes || ''
  });

  console.log(`📊 المخزون بعد التالف: ${newQuantityAfterDamage}`);

  return { 
    success: true, 
    message: `تم تسجيل تالف ${damageQuantity} من ${productForDamage.productName}` 
  };
}

// POST: إضافة منتج أو مرتجع أو تالف
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { action } = req.body;
  
  console.log(`📡 Stock API POST: action=${action}`);

  try {
    switch (action) {
      case 'add_item':
        console.log('📦 إضافة منتج جديد...');
        const addResult = await addStockItem(req.body);
        return res.status(200).json(addResult);

      case 'add_stock':
        console.log('📈 إضافة مخزون لمنتج موجود...');
        const addStockResult = await addStock(req.body.stockData);
        return res.status(200).json(addStockResult);

      case 'add_return':
        console.log('↩️ تسجيل مرتجع...');
        const returnResult = await addReturn(req.body.returnData);
        return res.status(200).json(returnResult);

      case 'add_damage':
        console.log('💥 تسجيل تلف/مفقود...');
        const damageResult = await addDamage(req.body.damageData);
        return res.status(200).json(damageResult);

      default:
        return res.status(400).json({ error: 'Invalid POST action' });
    }
  } catch (error: any) {
    console.error(`❌ خطأ في ${action}:`, error);
    return res.status(400).json({ error: error.message || 'حدث خطأ غير متوقع' });
  }
}

  // PUT: تحديث منتج موجود
  async function handlePut(req: NextApiRequest, res: NextApiResponse) {
    const { action, ...data } = req.body;

    switch (action) {
      case 'update_item':
        const { id, productName, initialQuantity, currentQuantity, synonyms, minThreshold, boost } = data;
        
        if (!productName || !productName.trim()) {
          return res.status(400).json({ error: 'اسم المنتج مطلوب' });
        }

        const parsedInitialQuantity = parseInt(initialQuantity);
        const parsedCurrentQuantity = parseInt(currentQuantity);
        const parsedMinThreshold = parseInt(minThreshold) || 10;

        if (isNaN(parsedInitialQuantity) || parsedInitialQuantity < 0) {
          return res.status(400).json({ error: 'الكمية الأولية يجب أن تكون صفر أو أكثر' });
        }

        if (isNaN(parsedCurrentQuantity) || parsedCurrentQuantity < 0) {
          return res.status(400).json({ error: 'الكمية الحالية يجب أن تكون صفر أو أكثر' });
        }

        if (parsedMinThreshold < 0) {
          return res.status(400).json({ error: 'الحد الأدنى لا يمكن أن يكون سالباً' });
        }

        console.log(`✏️ تحديث منتج: ${productName.trim()}`);
        console.log(`📊 الكمية الأولية: ${parsedInitialQuantity}, الحالية: ${parsedCurrentQuantity}, الحد الأدنى: ${parsedMinThreshold}`);

        // تحديث بيانات المنتج
        await addOrUpdateStockItem({
          id,
          productName: productName.trim(),
          initialQuantity: parsedInitialQuantity,
          currentQuantity: parsedCurrentQuantity,
          synonyms: synonyms?.trim() || '',
          minThreshold: parsedMinThreshold
        });

        // إذا كان هناك تعزيز للمخزون، نسجل الحركة
        if (boost && boost.amount > 0) {
          console.log(`🚀 تسجيل تعزيز المخزون: ${boost.amount} قطعة للمنتج ${productName.trim()}`);
          
          await addStockMovement({
            productName: productName.trim(),
            type: 'add_stock',
            quantity: boost.amount,
            reason: boost.reason || 'تعزيز مخزون من التعديل',
            supplier: '',
            cost: 0,
            notes: `تعزيز تلقائي من خلال تعديل المنتج في ${boost.date}`,
            date: boost.date
          });
        }

        // تسجيل ملاحظات حول التحديث
        let updateNotes = [];
        const sold = parsedInitialQuantity - parsedCurrentQuantity;
        
        if (boost && boost.amount > 0) {
          updateNotes.push(`تم تعزيز المخزون بـ ${boost.amount} قطعة`);
        }
        
        if (parsedCurrentQuantity > parsedInitialQuantity && (!boost || boost.amount === 0)) {
          updateNotes.push('الكمية الحالية أكبر من الأولية (ربما بسبب المرتجعات)');
        }
        
        if (sold > 0 && (!boost || boost.amount === 0)) {
          updateNotes.push(`تم بيع ${sold} قطعة`);
        }
        
        if (parsedCurrentQuantity <= parsedMinThreshold && parsedCurrentQuantity > 0) {
          updateNotes.push('المخزون وصل للحد الأدنى');
        } else if (parsedCurrentQuantity === 0) {
          updateNotes.push('المخزون نفد تماماً');
        }

        const responseMessage = updateNotes.length > 0 
          ? `تم تحديث ${productName.trim()} بنجاح. ${updateNotes.join('. ')}`
          : `تم تحديث ${productName.trim()} بنجاح`;

        return res.json({ 
          success: true, 
          message: responseMessage,
          notes: updateNotes,
          boost: boost || null
        });

      case 'adjust_quantity':
        const { productName: adjustProduct, adjustment, reason } = data;
        
        if (!adjustProduct || !adjustProduct.trim()) {
          return res.status(400).json({ error: 'اسم المنتج مطلوب' });
        }

        const parsedAdjustment = parseInt(adjustment);
        if (isNaN(parsedAdjustment)) {
          return res.status(400).json({ error: 'قيمة التعديل يجب أن تكون رقماً صحيحاً' });
        }

        console.log(`🔧 تعديل كمية: ${adjustProduct.trim()}, التعديل: ${parsedAdjustment}`);
        
        const stockDataForAdjust = await fetchStock(true);
        const productForAdjust = findProductBySynonyms(adjustProduct.trim(), stockDataForAdjust.stockItems);
        
        if (!productForAdjust) {
          return res.status(404).json({ error: 'المنتج غير موجود في المخزون' });
        }

        const oldQuantity = productForAdjust.currentQuantity;
        const newCurrentQuantity = Math.max(0, oldQuantity + parsedAdjustment);
        
        // التحقق من عدم السماح بتعديل سالب يجعل المخزون أقل من صفر
        if (parsedAdjustment < 0 && Math.abs(parsedAdjustment) > oldQuantity) {
          return res.status(400).json({ 
            error: `لا يمكن خصم ${Math.abs(parsedAdjustment)} لأن المخزون الحالي ${oldQuantity} فقط` 
          });
        }

        console.log(`📊 الكمية قبل التعديل: ${oldQuantity}, بعد التعديل: ${newCurrentQuantity}`);
        
        await addOrUpdateStockItem({
          ...productForAdjust,
          currentQuantity: newCurrentQuantity
        });

        // تسجيل حركة التعديل
        await addStockMovement({
          productName: productForAdjust.productName,
          type: 'adjustment',
          quantity: parsedAdjustment,
          reason: reason || 'تعديل المخزون اليدوي',
        });

        const adjustmentType = parsedAdjustment > 0 ? 'زيادة' : 'خصم';
        const adjustmentMessage = `تم ${adjustmentType} ${Math.abs(parsedAdjustment)} من ${productForAdjust.productName}. الكمية الحالية: ${newCurrentQuantity}`;

        return res.json({ 
          success: true, 
          message: adjustmentMessage,
          oldQuantity,
          newQuantity: newCurrentQuantity,
          adjustment: parsedAdjustment
        });

      default:
        return res.status(400).json({ error: 'إجراء غير صحيح' });
    }
  } 