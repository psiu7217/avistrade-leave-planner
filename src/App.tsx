import React, { useState } from "react";
import { AppProvider, useApp } from "./store/AppContext";
import { Header } from "./components/Header";
import { EmployeePage } from "./pages/EmployeePage";
import { HRPage } from "./pages/HRPage";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { HRTab } from "./domain/types";

function AppContent() {
  const { currentRole, currentUser, resetVersion, notification } = useApp();
  const [activeHRTab, setActiveHRTab] = useState<HRTab>("calendar");
  return (
    <div className="min-h-screen flex flex-col bg-[#F6F8F7] text-[#34495E]">
      <Header />
      {notification && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-md"
        >
          <div
            className={`p-4 rounded-xl shadow-lg border flex items-start gap-3 text-sm font-semibold ${notification.type === "success" ? "bg-[#DCF5ED] text-[#116149] border-[#007A60]" : notification.type === "error" ? "bg-[#FDEBED] text-[#A52A36] border-red-300" : "bg-[#34495E] text-white border-slate-700"}`}
          >
            {notification.type === "success" ? (
              <CheckCircle2 size={20} />
            ) : notification.type === "error" ? (
              <AlertCircle size={20} />
            ) : (
              <Info size={20} />
            )}
            <p>{notification.message}</p>
          </div>
        </div>
      )}
      <main id="main-content" className="flex-1">
        {currentRole === "employee" ? (
          <EmployeePage key={`${currentUser.id}-${resetVersion}`} />
        ) : (
          <HRPage
            key={resetVersion}
            activeTab={activeHRTab}
            setActiveTab={setActiveHRTab}
          />
        )}
      </main>
      <footer className="bg-white border-t border-[#D7DFDC] py-4 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <strong>LeaveFlow · Авистрейд</strong>
          <span>
            Предварительный план · Выбранные проверки · Официальное оформление
            выполняется отдельно
          </span>
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
