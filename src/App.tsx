/**
 * Main application component for LeaveFlow (Avistrade)
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { Header } from './components/Header';
import { DemoScenarioGuide } from './components/DemoScenarioGuide';
import { EmployeePage } from './pages/EmployeePage';
import { HRPage } from './pages/HRPage';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

function AppContent() {
  const { currentRole, setCurrentRole, setCurrentUser, setHorizon, setCalendarMonth, state, showNotification, notification } = useApp();
  const [activeHRTab, setActiveHRTab] = useState<'calendar' | 'queue' | 'rules' | 'audit'>('calendar');

  const handleSelectDemoStep = (stepNumber: number) => {
    switch (stepNumber) {
      case 1: {
        // Step 1: Employee Ivan Morozov selects Aug 23-29
        const ivan = state.employees.find((e) => e.id === 'emp-mpp-3') || state.employees[0];
        setCurrentUser(ivan);
        setCurrentRole('employee');
        setHorizon('H2');
        setCalendarMonth(8);
        showNotification('info', 'Шаг 1: Сотрудник Иван Морозов (МПП). Выберите 23–29 августа для подачи конфликтного отпуска.');
        break;
      }
      case 2: {
        // Step 2: Switch to HR and open queue
        setCurrentRole('hr');
        setActiveHRTab('queue');
        setHorizon('H2');
        setCalendarMonth(8);
        showNotification('info', 'Шаг 2: Кабинет HR. Откройте заявку Ивана Морозова в очереди для согласования исключения.');
        break;
      }
      case 3: {
        // Step 3: Return to Employee to verify approved exception
        const ivan = state.employees.find((e) => e.id === 'emp-mpp-3') || state.employees[0];
        setCurrentUser(ivan);
        setCurrentRole('employee');
        setHorizon('H2');
        setCalendarMonth(8);
        showNotification('info', 'Шаг 3: Проверка личного плана Ивана Морозова: статус «Согласовано в плане».');
        break;
      }
      case 4: {
        // Step 4: HR updates sales rule 2 -> 3
        setCurrentRole('hr');
        setActiveHRTab('rules');
        showNotification('info', 'Шаг 4: Раздел корпоративных правил. Измените лимит МПП с 2 на 3 с основанием.');
        break;
      }
      case 5: {
        // Step 5: Legal block demo 12+12
        setCurrentRole('hr');
        setActiveHRTab('queue');
        showNotification('info', 'Шаг 5: Правовой пример. Рассмотрите заявку Дениса Васильева (12+12 дней): ст. 174 ТК РБ блокирует исключение.');
        break;
      }
      default:
        break;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F8F7] text-[#34495E]">
      {/* Top Header */}
      <Header activeHRTab={activeHRTab} setActiveHRTab={setActiveHRTab} />

      {/* Demo Walkthrough Scenario Bar */}
      <DemoScenarioGuide onSelectDemoStep={handleSelectDemoStep} />

      {/* Global Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`p-3.5 rounded-xl shadow-lg border flex items-start gap-2.5 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-[#DCF5ED] text-[#116149] border-[#00A882]'
                : notification.type === 'error'
                ? 'bg-[#FDEBED] text-[#A52A36] border-red-300'
                : 'bg-[#34495E] text-white border-slate-700'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00A882]" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
            {notification.type === 'info' && <Info className="w-4 h-4 shrink-0 text-[#00A882]" />}
            <p className="flex-1 leading-snug">{notification.message}</p>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1">
        {currentRole === 'employee' ? (
          <EmployeePage />
        ) : (
          <HRPage activeTab={activeHRTab} setActiveTab={setActiveHRTab} />
        )}
      </main>

      {/* Clean Footer */}
      <footer className="bg-white border-t border-[#D7DFDC] py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#34495E]">LeaveFlow v2.0</span>
            <span>·</span>
            <span>ООО «Авистрейд» (Минск)</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Детерминированный движок правил ТК РБ и регламента компании · Прототип без передачи кадровых ПДн
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
