import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { cleanText, getUniqueProducts } from '../lib/textCleaner';

interface Order {
  id: number;
  rowIndex: number;
  orderDate: string;
  name: string;
  phone: string;
  whatsapp: string;
  governorate: string;
  area: string;
  address: string;
  orderDetails: string;
  quantity: string;
  totalPrice: string;
  productName: string;
  source: string;
  status: string;
  notes: string;
  whatsappSent: string;
}

interface BostaExportProps {
  orders: Order[];
  selectedOrders: number[];
  onSelectOrder: (orderId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdateOrder: (id: number, updates: Partial<Order>) => Promise<void>;
}

export default function BostaExport({ orders, selectedOrders, onSelectOrder, onSelectAll, onDeselectAll, onUpdateOrder }: BostaExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // Filter orders based on search and filters
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = !searchTerm || 
        order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm);
      
      const matchesProduct = !productFilter || cleanText(order.productName) === productFilter;
      const matchesSource = !sourceFilter || order.source === sourceFilter;
      
      return matchesSearch && matchesProduct && matchesSource;
    });
  }, [orders, searchTerm, productFilter, sourceFilter]);

  // استخدام الدالة المشتركة لإنشاء قائمة منتجات ومصادر نظيفة ومرتبة
  const products = useMemo(() => {
    return getUniqueProducts(orders);
  }, [orders]);
  
  const sources = [...new Set(orders.map(o => o.source).filter(Boolean))];

  const handleRevertStatus = async (orderId: number) => {
    setLoadingOrders(prev => new Set(prev.add(orderId)));
    try {
      await onUpdateOrder(orderId, { status: 'جديد' });
      // The parent component will handle the re-fetch, and this order will disappear.
    } catch (error) {
      console.error(`Failed to revert order ${orderId}:`, error);
      alert(`فشل في إعادة الطلب #${orderId}.`);
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const handleArchiveSelected = async () => {
    if (selectedOrders.length === 0) {
      alert('يرجى تحديد الطلبات التي تم تصديرها لأرشفتها.');
      return;
    }
    setIsArchiving(true);
    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: selectedOrders, status: 'تم الشحن' }),
      });
      onDeselectAll(); // Clear selection after archiving
      onUpdateOrder(0, {}); // Trigger a re-fetch by calling parent update function
    } catch (error) {
      console.error('Failed to archive orders:', error);
      alert('فشل في أرشفة الطلبات.');
    } finally {
      setIsArchiving(false);
    }
  };

  const openEditModal = (order: Order) => {
    setEditingOrder({ ...order });
    setEditModalOpen(true);
  };
  
  const handleUpdateField = (field: keyof Order, value: string) => {
    if (editingOrder) {
      setEditingOrder({ ...editingOrder, [field]: value });
    }
  };

  const saveOrder = async () => {
    if (!editingOrder) return;
    setLoadingOrders(prev => new Set(prev.add(editingOrder.id)));
    try {
      await onUpdateOrder(editingOrder.id, editingOrder);
      setEditModalOpen(false);
    } catch (error) {
      alert('فشل في حفظ التغييرات.');
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(editingOrder.id);
        return newSet;
      });
    }
  };

  const mapOrderToBosta = (order: Order) => {
    // دالة لتحويل رقم الهاتف إلى الصيغة المحلية المصرية (01xxxxxxxxx)
    const formatToLocalEgyptianNumber = (phone: string): string => {
      if (!phone) return '';
      
      // إزالة كل ما هو ليس رقماً
      let cleaned = phone.replace(/\D/g, '');
      
      // إذا كان الرقم يبدأ بـ 20 (مفتاح مصر) وطوله 12 رقم
      if (cleaned.startsWith('20') && cleaned.length === 12) {
        // إزالة الـ 20 وإضافة 0 في البداية
        return '0' + cleaned.substring(2);
      }
      
      // إذا كان الرقم يبدأ بـ 2 فقط (بدون الصفر) وطوله 11 رقم
      if (cleaned.startsWith('2') && cleaned.length === 11) {
        // إزالة الـ 2 وإضافة 0 في البداية
        return '0' + cleaned.substring(1);
      }
      
      // إذا كان الرقم يبدأ بـ 1 وطوله 10 أرقام (رقم مصري بدون الصفر)
      if (cleaned.startsWith('1') && cleaned.length === 10) {
        // إضافة 0 في البداية
        return '0' + cleaned;
      }
      
      // إذا كان الرقم بالفعل يبدأ بـ 01 وطوله 11 رقم
      if (cleaned.startsWith('01') && cleaned.length === 11) {
        return cleaned;
      }
      
      // إذا لم يطابق أي من الحالات، إرجاع الرقم كما هو بعد التنظيف
      return cleaned;
    };

    // دالة لتحويل أسماء المحافظات إلى الأسماء العربية الصحيحة
    const normalizeGovernorateName = (governorate: string): string => {
      if (!governorate) return '';
      
      // تنظيف النص من المسافات الزائدة والأحرف الخاصة
      const cleaned = governorate.trim();
      
      // قاموس التحويل للمحافظات - الأسماء العربية الدقيقة فقط
      const governorateMap: { [key: string]: string } = {
        // الأسماء الصحيحة المطلوبة (تبقى كما هي)
        'الشرقية': 'الشرقية',
        'بني سويف': 'بني سويف',
        'الإسماعيلية': 'الإسماعيلية',
        'جنوب سيناء': 'جنوب سيناء',
        'سوهاج': 'سوهاج',
        'كفر الشيخ': 'كفر الشيخ',
        'القليوبية': 'القليوبية',
        'الجيزة': 'الجيزة',
        'شمال سيناء': 'شمال سيناء',
        'القاهرة': 'القاهرة',
        'الأقصر': 'الأقصر',
        'السويس': 'السويس',
        'مرسى مطروح': 'مرسى مطروح',
        'البحيرة': 'البحيرة',
        'الغربية': 'الغربية',
        'الدقهلية': 'الدقهلية',
        'دمياط': 'دمياط',
        'المنيا': 'المنيا',
        'بور سعيد': 'بور سعيد',
        'الوادي الجديد': 'الوادي الجديد',
        'الإسكندرية': 'الإسكندرية',
        'أسيوط': 'أسيوط',
        'الفيوم': 'الفيوم',
        'قنا': 'قنا',
        'المنوفية': 'المنوفية',
        'البحر الأحمر': 'البحر الأحمر',
        'أسوان': 'أسوان',
        
        // الأسماء الإنجليزية
        'ash sharqia': 'الشرقية',
        'beni suef': 'بني سويف',
        'ismailia': 'الإسماعيلية',
        'south sinai': 'جنوب سيناء',
        'sohag': 'سوهاج',
        'kafr el sheikh': 'كفر الشيخ',
        'qalyubia': 'القليوبية',
        'giza': 'الجيزة',
        'north sinai': 'شمال سيناء',
        'cairo': 'القاهرة',
        'luxor': 'الأقصر',
        'suez': 'السويس',
        'matrouh': 'مرسى مطروح',
        'beheira': 'البحيرة',
        'gharbia': 'الغربية',
        'dakahlia': 'الدقهلية',
        'damietta': 'دمياط',
        'minya': 'المنيا',
        'port said': 'بور سعيد',
        'new valley': 'الوادي الجديد',
        'alexandria': 'الإسكندرية',
        'assiut': 'أسيوط',
        'faiyum': 'الفيوم',
        'qena': 'قنا',
        'menofia': 'المنوفية',
        'red sea': 'البحر الأحمر',
        'aswan': 'أسوان',
        
        // أسماء مشابهة أو متغيرات شائعة
        'شرقية': 'الشرقية',
        'بنى سويف': 'بني سويف',
        'اسماعيلية': 'الإسماعيلية',
        'إسماعيلية': 'الإسماعيلية',
        'سيناء الجنوبية': 'جنوب سيناء',
        'جنوب سينا': 'جنوب سيناء',
        'سينا الجنوبية': 'جنوب سيناء',
        'قليوبية': 'القليوبية',
        'جيزة': 'الجيزة',
        'سيناء الشمالية': 'شمال سيناء',
        'شمال سينا': 'شمال سيناء',
        'سينا الشمالية': 'شمال سيناء',
        'قاهرة': 'القاهرة',
        'اقصر': 'الأقصر',
        'أقصر': 'الأقصر',
        'لوكسور': 'الأقصر',
        'مطروح': 'مرسى مطروح',
        'بحيرة': 'البحيرة',
        'غربية': 'الغربية',
        'دقهلية': 'الدقهلية',
        'منيا': 'المنيا',
        'بورسعيد': 'بور سعيد',
        'اسكندرية': 'الإسكندرية',
        'اسيوط': 'أسيوط',
        'فيوم': 'الفيوم',
        'منوفية': 'المنوفية',
        'اسوان': 'أسوان'
      };
      
      // البحث المباشر
      const directMatch = governorateMap[cleaned];
      if (directMatch) return directMatch;
      
      // البحث بدون حساسية للحروف الكبيرة والصغيرة
      const lowerCaseMatch = governorateMap[cleaned.toLowerCase()];
      if (lowerCaseMatch) return lowerCaseMatch;
      
      // البحث الذكي للأسماء المشابهة
      for (const [key, value] of Object.entries(governorateMap)) {
        if (cleaned.includes(key) || key.includes(cleaned)) {
          return value;
        }
      }
      
      // إذا لم يتم العثور على تطابق، إرجاع النص الأصلي
      return cleaned;
    };
    
    return {
      'Full Name': order.name,
      'Phone': formatToLocalEgyptianNumber(order.phone),
      'Second Phone': order.whatsapp ? formatToLocalEgyptianNumber(order.whatsapp) : '',
      'City': normalizeGovernorateName(order.governorate),
      'Area': order.area || 'منطقة أخرى', // Default value if area is missing
      'Street Name': order.address,
      'Building#, Floor#, and Apartment#': '', // Optional, leave empty
      'Work address': '', // Optional, leave empty
      'Delivery notes': order.notes || '',

      // --- Order Details ---
      'Type': 'Cash Collection', // Default type as per requirement
      'Cash Amount': order.totalPrice ? order.totalPrice.replace(/\D/g, '') : '0',
      '#Items': order.quantity || '1',
      'Package Description': order.productName || order.orderDetails || 'Order',
      'Order Reference': `SMRKT-${order.id}-${new Date().toISOString().slice(0, 10)}`, // Unique reference
      'Allow opening package': '', // Optional, leave empty

      // --- Exchange / Large Deliveries (Optional) ---
      'Return #Items': '',
      'Return Package Description': '',
      'Package Type': '',
    };
  };

  const handleExport = () => {
    setIsExporting(true);
    
    try {
      const selectedOrdersData = orders.filter(order => selectedOrders.includes(order.id));
      if (selectedOrdersData.length === 0) {
        alert('يرجى تحديد طلب واحد على الأقل للتصدير.');
        setIsExporting(false);
        return;
      }
      
      const bostaData = selectedOrdersData.map(mapOrderToBosta);
      
      // Create a new workbook and a worksheet, forcing phone columns to be text
      const ws = XLSX.utils.json_to_sheet(bostaData);
      
      // Manually set the type for phone number columns to Text ('s')
      const range = XLSX.utils.decode_range(ws['!ref'] as string);
      for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Start from row 2 (skip header)
        const phoneCellAddress = XLSX.utils.encode_cell({c: 1, r: R}); // Column B
        const secondPhoneCellAddress = XLSX.utils.encode_cell({c: 2, r: R}); // Column C
        
        if(ws[phoneCellAddress]) ws[phoneCellAddress].t = 's';
        if(ws[secondPhoneCellAddress]) ws[secondPhoneCellAddress].t = 's';
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Bosta Orders");

      // Generate the .xlsx file and trigger a download
      const fileName = `bosta-orders-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('حدث خطأ أثناء التصدير');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="bg-white shadow-lg rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">تصدير طلبات بوسطة</h2>
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            >
              تحديد الكل
            </button>
            <button
              onClick={onDeselectAll}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">البحث</label>
              <input
                type="text"
                placeholder="بحث بالاسم أو الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">المنتج</label>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">كل المنتجات</option>
                {products.map(product => (
                  <option key={product} value={product}>{product}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">المصدر</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">كل المصادر</option>
                {sources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">تصدير الطلبات المؤكدة:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• يمكنك الآن تحديد وتصدير أي طلب مؤكد دون قيود.</li>
            <li>• سيتم استخدام البيانات المتاحة. قد تحتاج إلى إكمال البيانات المفقودة في ملف Excel.</li>
            <li className="font-bold">
              • إجمالي الطلبات المؤكدة: <span className="text-blue-700">{orders.length}</span>
            </li>
            <li className="font-bold">
              • الطلبات المعروضة: <span className="text-blue-700">{filteredOrders.length}</span>
            </li>
          </ul>
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-right">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={selectedOrders.length === filteredOrders.length ? onDeselectAll : onSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">#</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">الاسم</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">الهاتف</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">واتساب</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">المحافظة</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">العنوان</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">المنتج</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">السعر</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">الحالة</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.map((order) => {
                const isLoading = loadingOrders.has(order.id);
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 ${isLoading ? 'opacity-70' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => onSelectOrder(order.id)}
                        className="rounded"
                        title={'تحديد الطلب'}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-800">{order.id}</td>
                    <td className="px-3 py-2 text-gray-900 font-medium">{order.name}</td>
                    <td className="px-3 py-2 text-gray-800 font-mono">{order.phone}</td>
                    <td className="px-3 py-2 text-gray-800 font-mono">{order.whatsapp || '-'}</td>
                    <td className="px-3 py-2 text-gray-800">{order.governorate}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={order.address}>{order.address}</td>
                    <td className="px-3 py-2 text-gray-800">{order.productName}</td>
                    <td className="px-3 py-2 text-gray-900 font-semibold">{order.totalPrice}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 flex items-center gap-2">
                      <button
                        onClick={() => handleRevertStatus(order.id)}
                        disabled={isLoading}
                        className="text-sm text-blue-700 hover:text-blue-900 disabled:opacity-50"
                        title="إعادة الطلب إلى قائمة الطلبات النشطة"
                      >
                        {isLoading ? 'جاري...' : 'إعادة للطلبات'}
                      </button>
                      <button
                        onClick={() => openEditModal(order)}
                        className="text-gray-600 hover:text-blue-700 disabled:opacity-50"
                        title="تعديل الطلب"
                        disabled={isLoading}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            تم تحديد {selectedOrders.length} طلب للتصدير
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleArchiveSelected}
              disabled={selectedOrders.length === 0 || isArchiving}
              className="px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-2"
            >
              {isArchiving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              أرشفة ما تم تصديره (تم الشحن)
            </button>
            <button
              onClick={handleExport}
              disabled={selectedOrders.length === 0 || isExporting}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isExporting && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              تصدير ملف بوسطة
            </button>
          </div>
        </div>
      </div>
      
      {/* Edit Modal (Full version) */}
      {editModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">تعديل تفاصيل الطلب #{editingOrder.id}</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label><input type="text" value={editingOrder.name} onChange={(e) => handleUpdateField('name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label><input type="text" value={editingOrder.phone} onChange={(e) => handleUpdateField('phone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">رقم الواتساب</label><input type="text" value={editingOrder.whatsapp} onChange={(e) => handleUpdateField('whatsapp', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">المحافظة</label><input type="text" value={editingOrder.governorate} onChange={(e) => handleUpdateField('governorate', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">المنطقة</label><input type="text" value={editingOrder.area} onChange={(e) => handleUpdateField('area', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label><input type="text" value={editingOrder.productName} onChange={(e) => handleUpdateField('productName', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">الكمية</label><input type="text" value={editingOrder.quantity} onChange={(e) => handleUpdateField('quantity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">السعر الإجمالي</label><input type="text" value={editingOrder.totalPrice} onChange={(e) => handleUpdateField('totalPrice', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">المصدر</label><input type="text" value={editingOrder.source} onChange={(e) => handleUpdateField('source', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">العنوان الكامل</label><textarea value={editingOrder.address} onChange={(e) => handleUpdateField('address', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">تفاصيل الطلب</label><textarea value={editingOrder.orderDetails} onChange={(e) => handleUpdateField('orderDetails', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">الملاحظات</label><textarea value={editingOrder.notes} onChange={(e) => handleUpdateField('notes', e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" /></div>
            </div>
            
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => setEditModalOpen(false)} disabled={loadingOrders.has(editingOrder.id)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">إلغاء</button>
              <button onClick={saveOrder} disabled={loadingOrders.has(editingOrder.id)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {loadingOrders.has(editingOrder.id) && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 