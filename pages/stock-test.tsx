import { useState } from 'react';
import { useRouter } from 'next/router';

export default function StockTestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 10000);
  };

  const runDiagnosis = async () => {
    setIsLoading(true);
    try {
      console.log('🩺 بدء التشخيص الشامل...');
      
      const response = await fetch('/api/stock?action=diagnose');
      const result = await response.json();
      
      console.log('🩺 نتيجة التشخيص:', result);
      setResults(result);
      
      if (result.diagnoseResult.success) {
        showMessage('success', `✅ ${result.diagnoseResult.message}`);
      } else {
        showMessage('error', `❌ ${result.diagnoseResult.message}`);
      }
    } catch (error) {
      showMessage('error', 'فشل التشخيص');
      console.error('❌ خطأ في التشخيص:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runTest = async () => {
    setIsLoading(true);
    try {
      console.log('🧪 بدء اختبار التزامن...');
      
      const response = await fetch('/api/stock?action=test');
      const result = await response.json();
      
      console.log('🧪 نتيجة الاختبار:', result);
      setResults(result);
      
      if (result.testResult.success) {
        showMessage('success', `✅ ${result.testResult.message}`);
      } else {
        showMessage('error', `❌ ${result.testResult.message}`);
      }
    } catch (error) {
      showMessage('error', 'فشل اختبار التزامن');
      console.error('❌ خطأ في الاختبار:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStockData = async () => {
    setIsLoading(true);
    try {
      console.log('📊 جلب بيانات المخزون...');
      
      const response = await fetch('/api/stock?action=items&force=true');
      const result = await response.json();
      
      console.log('📊 بيانات المخزون:', result);
      setResults(result);
      
      showMessage('success', `تم جلب ${result.stockItems?.length || 0} منتج`);
    } catch (error) {
      showMessage('error', 'فشل جلب بيانات المخزون');
      console.error('❌ خطأ في جلب البيانات:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* العنوان */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">🩺 اختبار تشخيص المخزون</h1>
              <p className="text-gray-600">صفحة مخصصة لتشخيص واختبار تزامن Google Sheets مع نظام إدارة المخزون</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>

        {/* الرسائل */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {message.type === 'success' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                )}
              </svg>
              {message.text}
            </div>
          </div>
        )}

        {/* أزرار الاختبار */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">أدوات التشخيص والاختبار</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={runDiagnosis}
              disabled={isLoading}
              className="p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex flex-col items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">تشخيص شامل</span>
              <span className="text-xs opacity-75">فحص شامل لـ Google Sheets</span>
            </button>

            <button
              onClick={runTest}
              disabled={isLoading}
              className="p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex flex-col items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="font-medium">اختبار التزامن</span>
              <span className="text-xs opacity-75">اختبار إضافة منتج تجريبي</span>
            </button>

            <button
              onClick={fetchStockData}
              disabled={isLoading}
              className="p-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex flex-col items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.59 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.59 4 8 4s8-1.79 8-4M4 7c0-2.21 3.59-4 8-4s8 1.79 8 4" />
              </svg>
              <span className="font-medium">جلب البيانات</span>
              <span className="text-xs opacity-75">جلب البيانات من Google Sheets</span>
            </button>
          </div>
        </div>

        {/* النتائج */}
        {results && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">📋 نتائج الاختبار</h2>
            <div className="bg-gray-50 rounded-lg p-4 overflow-auto">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                {JSON.stringify(results, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-gray-900 font-medium">جاري التشخيص...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 