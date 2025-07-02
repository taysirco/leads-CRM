import React, { useState } from 'react';
import { 
  generateFollowUpMessage, 
  generateSecondReminderMessage, 
  generateConfirmationMessage, 
  generateShippingMessage,
  createWhatsAppLink,
  CustomerInfo 
} from '../lib/whatsappMessages';

interface WhatsAppTemplatesProps {
  customer: CustomerInfo;
  orderStatus: string;
}

interface MessageTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  generator: (customer: CustomerInfo) => string;
  statusMatch?: string[];
}

export default function WhatsAppTemplates({ customer, orderStatus }: WhatsAppTemplatesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const templates: MessageTemplate[] = [
    {
      id: 'follow-up',
      title: 'رسالة المتابعة الأولى',
      description: 'رسالة مختصرة ومباشرة للعملاء الذين لم يردوا',
      icon: '📞',
      generator: generateFollowUpMessage,
      statusMatch: ['جديد', 'لم يرد']
    },
    {
      id: 'reminder',
      title: 'رسالة التذكير',
      description: 'تذكير أخير للعملاء المتردين',
      icon: '⏰',
      generator: generateSecondReminderMessage,
      statusMatch: ['في انتظار تأكيد العميل', 'لم يرد']
    },
    {
      id: 'confirmation',
      title: 'رسالة التأكيد',
      description: 'شكر العميل على تأكيد الطلب',
      icon: '✅',
      generator: generateConfirmationMessage,
      statusMatch: ['تم التأكيد']
    },
    {
      id: 'shipping',
      title: 'رسالة الشحن',
      description: 'إخبار العميل بشحن الطلب',
      icon: '🚚',
      generator: generateShippingMessage,
      statusMatch: ['تم الشحن']
    }
  ];

  const handleTemplateSelect = (template: MessageTemplate) => {
    const message = template.generator(customer);
    
    // كشف نظام التشغيل
    const isWindows = navigator.platform.toLowerCase().includes('win');
    
    if (isWindows) {
      // للويندوز: استخدام طريقة مختلفة
      const cleanPhone = customer.phone.replace(/\+/g, '');
      
      // تحضير الرسالة للويندوز
      const formattedMessage = message
        .replace(/\*/g, '') // إزالة علامات Bold
        .replace(/\n/g, ' '); // استبدال الأسطر الجديدة بمسافات
      
      // استخدام encodeURIComponent مرة واحدة فقط
      const encodedMessage = encodeURIComponent(formattedMessage);
      
      const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
      window.open(whatsappLink, '_blank');
    } else {
      // للأنظمة الأخرى: استخدام الطريقة العادية
      const whatsappLink = createWhatsAppLink(customer.phone, message);
      window.open(whatsappLink, '_blank');
    }
    
    setIsOpen(false);
  };

  const getRecommendedTemplates = () => {
    return templates.filter(template => 
      !template.statusMatch || template.statusMatch.includes(orderStatus)
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 border border-green-200"
        title="رسائل WhatsApp جاهزة"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-8 z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-800 text-sm">رسائل WhatsApp جاهزة</h3>
            <p className="text-xs text-gray-600">اختر الرسالة المناسبة لحالة الطلب</p>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {getRecommendedTemplates().map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateSelect(template)}
                className="w-full p-3 text-right hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{template.icon}</span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-800 text-sm">{template.title}</h4>
                    <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                    {template.statusMatch?.includes(orderStatus) && (
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded mt-1">
                        مناسب للحالة الحالية
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-600">
              <strong>العميل:</strong> {customer.name}<br/>
              <strong>المنتج:</strong> {customer.productName}
              {customer.totalPrice && (
                <>
                  <br/><strong>السعر:</strong> {customer.totalPrice}
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-2 left-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
} 