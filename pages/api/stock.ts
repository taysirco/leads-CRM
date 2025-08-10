import { NextApiRequest, NextApiResponse } from 'next';
import { 
  fetchStock, 
  addOrUpdateStockItem, 
  deductStock, 
  addDailyReturn, 
  getStockAlerts, 
  getStockReports,
  addStockMovement,
  findProductBySynonyms,
  testStockSheetConnection
} from '../../lib/googleSheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // التحقق من المصادقة
  const authToken = req.cookies.auth_token;
  const userRole = req.cookies.user_role;
  
  if (!authToken) {
    return res.status(401).json({ error: 'غير مصرح' });
  }

  // التحقق من صلاحيات الأدمن
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'صلاحية الأدمن فقط' });
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
  } catch (error) {
    console.error('Stock API error:', error);
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
}

// GET: جلب المخزون والتقارير
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { action } = req.query;

  switch (action) {
    case 'alerts':
      const alerts = await getStockAlerts();
      return res.json({ alerts });

    case 'reports':
      const reports = await getStockReports();
      return res.json({ reports });

    case 'test':
      console.log('🧪 بدء اختبار التزامن مع Google Sheets...');
      const testResult = await testStockSheetConnection();
      return res.json({ 
        testResult,
        timestamp: new Date().toISOString(),
        message: 'تم تشغيل اختبار التزامن'
      });

    case 'items':
    default:
      const stockItems = await fetchStock();
      return res.json({ stockItems });
  }
}

// POST: إضافة منتج جديد أو عمليات أخرى
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { action, ...data } = req.body;

  switch (action) {
    case 'add_item':
      const { productName, initialQuantity, synonyms, minThreshold } = data;
      
      if (!productName || initialQuantity === undefined) {
        return res.status(400).json({ error: 'اسم المنتج والكمية مطلوبان' });
      }

      await addOrUpdateStockItem({
        productName,
        initialQuantity: parseInt(initialQuantity),
        currentQuantity: parseInt(initialQuantity),
        synonyms: synonyms || '',
        minThreshold: parseInt(minThreshold) || 10
      });

      return res.json({ 
        success: true, 
        message: `تم إضافة ${productName} بكمية ${initialQuantity}` 
      });

    case 'add_return':
      const { returnData } = data;
      
      if (!returnData.productName || !returnData.quantity) {
        return res.status(400).json({ error: 'اسم المنتج والكمية مطلوبان للمرتجع' });
      }

      await addDailyReturn(returnData);
      
      return res.json({ 
        success: true, 
        message: `تم تسجيل مرتجع ${returnData.quantity} من ${returnData.productName}` 
      });

    case 'add_damage':
      const { damageData } = data;
      
      if (!damageData.productName || !damageData.quantity) {
        return res.status(400).json({ error: 'اسم المنتج والكمية مطلوبان للتالف' });
      }

      // خصم الكمية التالفة من المخزون
      const stockItems = await fetchStock();
      const stockItem = findProductBySynonyms(damageData.productName, stockItems);
      
      if (!stockItem) {
        return res.status(404).json({ error: 'المنتج غير موجود في المخزون' });
      }

      const newQuantity = Math.max(0, stockItem.currentQuantity - damageData.quantity);
      
      await addOrUpdateStockItem({
        ...stockItem,
        currentQuantity: newQuantity
      });

      // تسجيل حركة التالف
      await addStockMovement({
        productName: stockItem.productName,
        type: damageData.type || 'damage',
        quantity: -damageData.quantity,
        reason: damageData.reason || 'تالف',
        notes: damageData.notes
      });

      return res.json({ 
        success: true, 
        message: `تم تسجيل تالف ${damageData.quantity} من ${stockItem.productName}. المتبقي: ${newQuantity}` 
      });

    case 'deduct_stock':
      const { productName: deductProduct, quantity, orderId } = data;
      
      const result = await deductStock(deductProduct, quantity, orderId);
      
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(400).json(result);
      }

    default:
      return res.status(400).json({ error: 'إجراء غير صحيح' });
  }
}

// PUT: تحديث منتج موجود
async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const { action, ...data } = req.body;

  switch (action) {
    case 'update_item':
      const { id, productName, initialQuantity, currentQuantity, synonyms, minThreshold } = data;
      
      if (!productName) {
        return res.status(400).json({ error: 'اسم المنتج مطلوب' });
      }

      await addOrUpdateStockItem({
        id,
        productName,
        initialQuantity: parseInt(initialQuantity),
        currentQuantity: parseInt(currentQuantity),
        synonyms: synonyms || '',
        minThreshold: parseInt(minThreshold) || 10
      });

      return res.json({ 
        success: true, 
        message: `تم تحديث ${productName} بنجاح` 
      });

    case 'adjust_quantity':
      const { productName: adjustProduct, adjustment, reason } = data;
      
      const stockItems = await fetchStock();
      const stockItem = findProductBySynonyms(adjustProduct, stockItems);
      
      if (!stockItem) {
        return res.status(404).json({ error: 'المنتج غير موجود في المخزون' });
      }

      const newCurrentQuantity = Math.max(0, stockItem.currentQuantity + adjustment);
      
      await addOrUpdateStockItem({
        ...stockItem,
        currentQuantity: newCurrentQuantity
      });

      // تسجيل حركة التعديل
      await addStockMovement({
        productName: stockItem.productName,
        type: 'adjustment',
        quantity: adjustment,
        reason: reason || 'تعديل المخزون',
      });

      return res.json({ 
        success: true, 
        message: `تم تعديل ${stockItem.productName}. الكمية الحالية: ${newCurrentQuantity}` 
      });

    default:
      return res.status(400).json({ error: 'إجراء غير صحيح' });
  }
} 