/**
 * Quick 3-Minute Demo Walkthrough Bar
 * Conforms to Section 14.2 of the Technical Specification.
 */

import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { ChevronDown, ChevronUp, Play, CheckCircle2, ArrowRight } from 'lucide-react';

export function DemoScenarioGuide({
  onSelectDemoStep,
}: {
  onSelectDemoStep: (stepNumber: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const { currentRole, currentUser } = useApp();

  const steps = [
    {
      num: 1,
      time: '0:00–0:50',
      title: 'Шаг 1. Сотрудник: конфликт 23–29 авг',
      desc: 'Иван Морозов (МПП) выбирает 23–29 августа, видит конфликт лимита продаж, ставит checkbox и отправляет.',
    },
    {
      num: 2,
      time: '0:50–1:30',
      title: 'Шаг 2. HR: согласование исключения',
      desc: 'HR видит имена пересекающихся коллег (Смирнов, Ковалев) и согласует корпоративное исключение с основанием.',
    },
    {
      num: 3,
      time: '1:30–1:50',
      title: 'Шаг 3. Сотрудник: проверка результата',
      desc: 'Возврат к Ивану: статус «Согласовано в плане» с бейджем «Корпоративное исключение». Обновление страницы сохраняет данные.',
    },
    {
      num: 4,
      time: '1:50–2:20',
      title: 'Шаг 4. HR: изменение правила 2 → 3',
      desc: 'HR меняет salesMaxConcurrent с 2 на 3 с основанием. Система пересчитывает конфликты без отмены прежних решений.',
    },
    {
      num: 5,
      time: '2:20–2:45',
      title: 'Шаг 5. Правовой блок: 12+12 дней (ст. 174)',
      desc: 'Открытие заявки Дениса Васильева (12+12 дней). Исключение невозможно: одна часть обязательно ≥14 дней.',
    },
  ];

  return (
    <div className="bg-[#FFFFFF] border-b border-[#D7DFDC] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#00A882]/10 text-[#007A60] flex items-center justify-center font-bold text-xs">
              <Play className="w-3 h-3 fill-current" />
            </div>
            <span className="text-xs font-bold text-[#34495E]">
              Сценарий демонстрации (3 мин по ТЗ п. 14.2)
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline">
              · Текущий режим: {currentRole === 'employee' ? `Сотрудник (${currentUser.name})` : 'HR'}
            </span>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#34495E] py-1 px-2 rounded hover:bg-slate-50 transition-colors"
          >
            <span>{isOpen ? 'Свернуть подсказки' : 'Показать шаги демо'}</span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {isOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-2 pt-2 border-t border-slate-100">
            {steps.map((s) => (
              <button
                key={s.num}
                onClick={() => onSelectDemoStep(s.num)}
                className="text-left p-2 rounded-lg border border-slate-200 hover:border-[#00A882] hover:bg-[#DCF5ED]/20 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-[#007A60]">{s.title}</span>
                    <span className="text-[10px] text-slate-600 tabular-nums">{s.time}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">{s.desc}</p>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-[#007A60] opacity-80 group-hover:opacity-100">
                  <span>Перейти к шагу</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
