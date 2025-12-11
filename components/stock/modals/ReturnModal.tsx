import React, { useState } from 'react';
import type { StockItem } from './AddProductModal';

interface ReturnModalProps {
    stockItems: StockItem[];
    onClose: () => void;
    onSubmit: (formData: {
        productName: string;
        quantity: string;
        reason: string;
        notes: string;
    }) => void;
    isLoading: boolean;
}

/**
 * نافذة تسجيل مرتجع
 */
function ReturnModal({ stockItems, onClose, onSubmit, isLoading }: ReturnModalProps) {
    const [formData, setFormData] = useState({
        productName: '',
        quantity: '',
        reason: 'other',
        notes: ''
    });

    const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
    const [previewQuantity, setPreviewQuantity] = useState(0);

    const handleProductChange = (productName: string) => {
        const product = stockItems.find((item) => item.productName === productName);
        setSelectedProduct(product || null);
        setFormData({ ...formData, productName });
        updatePreview(formData.quantity, product);
    };

    const handleQuantityChange = (quantity: string) => {
        setFormData({ ...formData, quantity });
        updatePreview(quantity, selectedProduct);
    };

    const updatePreview = (quantity: string, product: StockItem | null | undefined) => {
        if (product && quantity) {
            const qty = parseInt(quantity) || 0;
            setPreviewQuantity(product.currentQuantity + qty);
        } else {
            setPreviewQuantity(0);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const quantity = parseInt(formData.quantity) || 0;

        if (quantity <= 0) {
            alert('كمية المرتجع يجب أن تكون أكبر من صفر');
            return;
        }

        if (!selectedProduct) {
            alert('يجب اختيار المنتج');
            return;
        }

        // تأكيد العملية
        const confirmMessage = `هل تريد تسجيل مرتجع ${quantity} قطعة من ${selectedProduct.productName}?\n\nالمخزون الحالي: ${selectedProduct.currentQuantity}\nبعد المرتجع: ${previewQuantity}`;

        if (window.confirm(confirmMessage)) {
            onSubmit(formData);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
            <div className="relative p-4 sm:p-8 bg-white w-full max-w-md mx-auto rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">تسجيل مرتجع</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl sm:text-2xl font-bold">×</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
                        <select
                            value={formData.productName}
                            onChange={(e) => handleProductChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 text-sm"
                            required
                        >
                            <option value="">اختر المنتج</option>
                            {stockItems.map((item) => (
                                <option key={item.id} value={item.productName} className="text-gray-900 bg-white">
                                    {item.productName} (متوفر: {item.currentQuantity})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الكمية المرتجعة</label>
                        <input
                            type="number"
                            value={formData.quantity}
                            onChange={(e) => handleQuantityChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
                            min="1"
                            placeholder="أدخل الكمية المرتجعة"
                            required
                        />
                    </div>

                    {/* معاينة تأثير العملية */}
                    {selectedProduct && formData.quantity && (
                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                            <h4 className="text-sm font-medium text-green-800 mb-2">📈 معاينة تأثير المرتجع:</h4>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-green-700">المخزون الحالي:</span>
                                    <span className="font-medium text-green-900">{selectedProduct.currentQuantity}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-green-700">الكمية المرتجعة:</span>
                                    <span className="font-medium text-green-600">+{formData.quantity}</span>
                                </div>
                                <hr className="border-green-200" />
                                <div className="flex justify-between font-bold">
                                    <span className="text-green-800">المخزون الجديد:</span>
                                    <span className="text-green-800">{previewQuantity}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">سبب المرتجع</label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 text-sm"
                        >
                            <option value="damaged_shipping" className="text-gray-900 bg-white">تلف أثناء الشحن</option>
                            <option value="customer_damage" className="text-gray-900 bg-white">تلف من العميل</option>
                            <option value="other" className="text-gray-900 bg-white">أخرى</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
                            rows={3}
                            placeholder="تفاصيل إضافية عن سبب المرتجع..."
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm order-2 sm:order-1">
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !selectedProduct || !formData.quantity}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm order-1 sm:order-2"
                        >
                            {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                            تسجيل المرتجع
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ReturnModal;
export type { ReturnModalProps };
