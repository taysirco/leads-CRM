import React, { useState } from 'react';
import type { StockItem } from './AddProductModal';

interface DamageModalProps {
    stockItems: StockItem[];
    onClose: () => void;
    onSubmit: (formData: {
        productName: string;
        quantity: string;
        type: string;
        reason: string;
        notes: string;
    }) => void;
    isLoading: boolean;
}

/**
 * نافذة تسجيل تالف/مفقود
 */
function DamageModal({ stockItems, onClose, onSubmit, isLoading }: DamageModalProps) {
    const [formData, setFormData] = useState({
        productName: '',
        quantity: '',
        type: 'damage',
        reason: 'تلف أثناء الشحن',
        notes: ''
    });

    const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
    const [previewQuantity, setPreviewQuantity] = useState(0);
    const [error, setError] = useState('');

    const handleProductChange = (productName: string) => {
        const product = stockItems.find((item) => item.productName === productName);
        setSelectedProduct(product || null);
        setFormData({ ...formData, productName });
        updatePreview(formData.quantity, product);
        setError('');
    };

    const handleQuantityChange = (quantity: string) => {
        setFormData({ ...formData, quantity });
        updatePreview(quantity, selectedProduct);
    };

    const updatePreview = (quantity: string, product: StockItem | null | undefined) => {
        if (product && quantity) {
            const qty = parseInt(quantity) || 0;
            const newQty = Math.max(0, product.currentQuantity - qty);
            setPreviewQuantity(newQty);

            // التحقق من كفاية المخزون
            if (qty > product.currentQuantity) {
                setError(`المخزون غير كافي! المتوفر: ${product.currentQuantity}, المطلوب: ${qty}`);
            } else {
                setError('');
            }
        } else {
            setPreviewQuantity(0);
            setError('');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const quantity = parseInt(formData.quantity) || 0;

        if (quantity <= 0) {
            alert('كمية التالف يجب أن تكون أكبر من صفر');
            return;
        }

        if (!selectedProduct) {
            alert('يجب اختيار المنتج');
            return;
        }

        if (quantity > selectedProduct.currentQuantity) {
            alert(`المخزون غير كافي! المتوفر: ${selectedProduct.currentQuantity}`);
            return;
        }

        // تأكيد العملية
        const confirmMessage = `⚠️ تحذير: هل تريد تسجيل تالف ${quantity} قطعة من ${selectedProduct.productName}?\n\nسيتم خصم هذه الكمية من المخزون نهائياً.\n\nالمخزون الحالي: ${selectedProduct.currentQuantity}\nبعد التالف: ${previewQuantity}`;

        if (window.confirm(confirmMessage)) {
            onSubmit(formData);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
            <div className="relative p-4 sm:p-8 bg-white w-full max-w-md mx-auto rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">تسجيل تالف/مفقود</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl sm:text-2xl font-bold">×</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
                        <select
                            value={formData.productName}
                            onChange={(e) => handleProductChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 text-sm"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">الكمية التالفة/المفقودة</label>
                        <input
                            type="number"
                            value={formData.quantity}
                            onChange={(e) => handleQuantityChange(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                }`}
                            min="1"
                            max={selectedProduct?.currentQuantity || 0}
                            placeholder="أدخل الكمية التالفة"
                            required
                        />
                        {error && (
                            <p className="text-red-600 text-xs mt-1">{error}</p>
                        )}
                    </div>

                    {/* معاينة تأثير العملية */}
                    {selectedProduct && formData.quantity && !error && (
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <h4 className="text-sm font-medium text-red-800 mb-2">📉 معاينة تأثير التالف:</h4>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-red-700">المخزون الحالي:</span>
                                    <span className="font-medium text-red-900">{selectedProduct.currentQuantity}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-red-700">الكمية التالفة:</span>
                                    <span className="font-medium text-red-600">-{formData.quantity}</span>
                                </div>
                                <hr className="border-red-200" />
                                <div className="flex justify-between font-bold">
                                    <span className="text-red-800">المخزون الجديد:</span>
                                    <span className="text-red-800">{previewQuantity}</span>
                                </div>
                                {previewQuantity <= (selectedProduct.minThreshold || 10) && (
                                    <div className="text-xs text-red-600 mt-2">
                                        ⚠️ تحذير: المخزون سيصل للحد الأدنى أو أقل
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">نوع التلف</label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 text-sm"
                        >
                            <option value="تلف أثناء الشحن" className="text-gray-900 bg-white">تلف أثناء الشحن</option>
                            <option value="فقدان" className="text-gray-900 bg-white">فقدان</option>
                            <option value="تلف من العميل" className="text-gray-900 bg-white">تلف من العميل</option>
                            <option value="تلف في المخزن" className="text-gray-900 bg-white">تلف في المخزن</option>
                            <option value="انتهاء صلاحية" className="text-gray-900 bg-white">انتهاء صلاحية</option>
                            <option value="أخرى" className="text-gray-900 bg-white">أخرى</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
                            rows={3}
                            placeholder="تفاصيل إضافية عن سبب التلف أو الفقدان..."
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm order-2 sm:order-1">
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !selectedProduct || !formData.quantity || !!error}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm order-1 sm:order-2"
                        >
                            {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                            تسجيل التالف
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DamageModal;
export type { DamageModalProps };
