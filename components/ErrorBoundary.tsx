import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * يحمي التطبيق من الانهيار الكامل عند حدوث أخطاء في المكونات الفرعية
 */
class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        // تحديث الحالة لعرض واجهة الخطأ
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // تسجيل الخطأ
        console.error('🚨 Error Boundary caught an error:', error);
        console.error('📍 Component Stack:', errorInfo.componentStack);

        this.setState({ errorInfo });

        // استدعاء callback إذا وُجد
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    handleReload = (): void => {
        window.location.reload();
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // إذا تم تمرير fallback مخصص، استخدمه
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // الواجهة الافتراضية للخطأ
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
                    <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 sm:p-8 text-center">
                        {/* أيقونة الخطأ */}
                        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                            <svg
                                className="w-8 h-8 text-red-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>

                        {/* العنوان */}
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            عذراً، حدث خطأ غير متوقع
                        </h2>

                        {/* الوصف */}
                        <p className="text-gray-600 mb-6">
                            نعتذر عن الإزعاج. يمكنك المحاولة مرة أخرى أو إعادة تحميل الصفحة.
                        </p>

                        {/* تفاصيل الخطأ (للمطورين فقط) */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="mb-6 p-3 bg-gray-100 rounded-lg text-right">
                                <p className="text-xs text-gray-500 mb-1">تفاصيل الخطأ:</p>
                                <p className="text-sm text-red-600 font-mono break-all">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}

                        {/* الأزرار */}
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={this.handleRetry}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                حاول مرة أخرى
                            </button>

                            <button
                                onClick={this.handleReload}
                                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                إعادة تحميل الصفحة
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
