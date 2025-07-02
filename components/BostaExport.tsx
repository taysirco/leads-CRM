import { useState } from 'react';

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
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());

  const exportableOrders = orders.filter(order => 
    order.status === 'تم التأكيد' && 
    order.name && 
    order.phone && 
    order.governorate &&
    order.address
  );

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

  const mapOrderToBosta = (order: Order) => {
    // الأرقام منسقة بالفعل، نحتاج فقط لإزالة + وإبقاء الأرقام فقط
    const cleanPhone = order.phone.replace(/\+/g, '');
    const cleanWhatsapp = order.whatsapp.replace(/\+/g, '');
    
    return {
      'Full Name': order.name,
      'Phone': cleanPhone, // الرقم منسق بالفعل، نزيل + فقط
      'Second Phone': cleanWhatsapp, // رقم الواتساب منسق بالفعل
      'City': order.governorate,
      'Area': order.area || 'منطقة أخري',
      'Street Name': order.address,
      'Building#, Floor#, and Apartment#': '',
      'Work address': '',
      'Delivery notes': order.notes || '',
      'Type': 'Cash Collection',
      'Cash Amount': order.totalPrice ? order.totalPrice.replace(/\D/g, '') : '',
      '#Items': order.quantity || '1',
      'Package Description': order.productName || order.orderDetails || 'طلب',
      'Order Reference': `ORDER-${order.id}`,
      'Allow opening package': '',
      'Return #Items': '',
      'Return Package Description': '',
      'Package Type': ''
    };
  };

  const handleExport = () => {
    setIsExporting(true);
    
    try {
      const selectedOrdersData = orders.filter(order => selectedOrders.includes(order.id));
      const bostaData = selectedOrdersData.map(mapOrderToBosta);
      
      // Create CSV content
      const headers = Object.keys(bostaData[0] || {});
      const csvContent = [
        headers.join(','),
        ...bostaData.map(row => 
          headers.map(header => {
            const value = row[header as keyof typeof row] || '';
            // Escape commas and quotes in values
            return `"${String(value).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `bosta-orders-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('حدث خطأ أثناء التصدير');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">تصدير طلبات بوسطة</h2>
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

      <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-medium text-yellow-800 mb-2">متطلبات التصدير:</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• يجب أن تكون حالة الطلب "تم التأكيد"</li>
          <li>• يجب توفر الاسم ورقم الهاتف والمحافظة والعنوان</li>
          <li>• سيتم تصدير {exportableOrders.length} طلب من أصل {orders.length}</li>
        </ul>
      </div>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-right">
                <input
                  type="checkbox"
                  checked={selectedOrders.length === exportableOrders.length && exportableOrders.length > 0}
                  onChange={selectedOrders.length === exportableOrders.length ? onDeselectAll : onSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">#</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">الاسم</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">الهاتف</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">المحافظة</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">المنتج</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">السعر</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">الحالة</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {exportableOrders.map((order) => {
              const isLoading = loadingOrders.has(order.id);
              return (
                <tr key={order.id} className={`hover:bg-gray-50 ${isLoading ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedOrders.includes(order.id)}
                      onChange={() => onSelectOrder(order.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-2">{order.id}</td>
                  <td className="px-3 py-2">{order.name}</td>
                  <td className="px-3 py-2">{order.phone}</td>
                  <td className="px-3 py-2">{order.governorate}</td>
                  <td className="px-3 py-2">{order.productName}</td>
                  <td className="px-3 py-2">{order.totalPrice}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleRevertStatus(order.id)}
                      disabled={isLoading}
                      className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      title="إعادة الطلب إلى قائمة الطلبات النشطة"
                    >
                      {isLoading ? 'جاري...' : 'إعادة للطلبات'}
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
  );
} 