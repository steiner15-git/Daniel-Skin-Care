import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import RequireAuth from "./auth/RequireAuth";
import { useAutoBackup } from "./data/useAutoBackup";
import { useRecurringExpenses } from "./data/useRecurringExpenses";
import { useSettingDoc } from "./data";
import { LOGO_CACHE_KEY } from "./utils/logo";
import AppShell from "./components/AppShell";
import Dashboard from "./screens/Dashboard";
import AllPhotos from "./screens/AllPhotos";
import AppointmentForm from "./screens/appointments/AppointmentForm";
import SendInvite from "./screens/appointments/SendInvite";
import CloseAppointment from "./screens/appointments/CloseAppointment";
import Calendar from "./screens/calendar/Calendar";
import EventForm from "./screens/calendar/EventForm";
import Business from "./screens/business/Business";
import IncomeForm from "./screens/business/IncomeForm";
import ExpenseForm from "./screens/business/ExpenseForm";
import AuditLog from "./screens/business/AuditLog";
import ClientsList from "./screens/clients/ClientsList";
import AddClient from "./screens/clients/AddClient";
import ClientCard from "./screens/clients/ClientCard";
import ClientDiagnosis from "./screens/clients/ClientDiagnosis";
import ClientArchive from "./screens/clients/ClientArchive";
import Products from "./screens/Products";
import ProductSell from "./screens/ProductSell";
import Series from "./screens/Series";
import SeriesPurchase from "./screens/SeriesPurchase";
import SettingsHome from "./screens/settings/SettingsHome";
import BusinessDetails from "./screens/settings/BusinessDetails";
import Treatments from "./screens/settings/Treatments";
import Invitation from "./screens/settings/Invitation";
import PaymentVerification from "./screens/settings/PaymentVerification";
import ExpenseCategories from "./screens/settings/ExpenseCategories";
import PaymentMethods from "./screens/settings/PaymentMethods";
import WorkingHours from "./screens/settings/WorkingHours";

function AutoBackup() {
  useAutoBackup();
  return null;
}

function RecurringExpenses() {
  useRecurringExpenses();
  return null;
}

// שומר את הלוגו ב-localStorage כדי שמסך ההתחברות (לפני אימות) יוכל להציגו.
function LogoCache() {
  const { data } = useSettingDoc("business");
  useEffect(() => {
    if (data?.logoData) localStorage.setItem(LOGO_CACHE_KEY, data.logoData);
    else if (data) localStorage.removeItem(LOGO_CACHE_KEY);
  }, [data]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <AutoBackup />
        <RecurringExpenses />
        <LogoCache />
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="album" element={<AllPhotos />} />
              <Route path="appointments" element={<AppointmentForm />} />
              <Route path="appointments/:id/edit" element={<AppointmentForm />} />
              <Route path="appointments/:id/send" element={<SendInvite />} />
              <Route path="appointments/:id/close" element={<CloseAppointment />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="calendar/event/new" element={<EventForm />} />
              <Route path="calendar/event/:id/edit" element={<EventForm />} />
              <Route path="business" element={<Business />} />
              <Route path="business/income/new" element={<IncomeForm />} />
              <Route path="business/income/:id/edit" element={<IncomeForm />} />
              <Route path="business/expense/new" element={<ExpenseForm />} />
              <Route path="business/expense/:id/edit" element={<ExpenseForm />} />
              <Route path="clients" element={<ClientsList />} />
              <Route path="clients/new" element={<AddClient />} />
              <Route path="clients/archive" element={<ClientArchive />} />
              <Route path="clients/:id" element={<ClientCard />} />
              <Route path="clients/:id/diagnosis" element={<ClientDiagnosis />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id/sell" element={<ProductSell />} />
              <Route path="series" element={<Series />} />
              <Route 
path="series/:id/purchase" element={<SeriesPurchase />} />
              <Route path="settings" element={<SettingsHome />} />
              <Route path="settings/business" element={<BusinessDetails />} />
              <Route path="settings/treatments" element={<Treatments />} />
              <Route path="settings/invitation" element={<Invitation />} />
              <Route
                path="settings/payment-verification"
                element={<PaymentVerification />}
              />
              <Route
                path="settings/expense-categories"
                element={<ExpenseCategories />}
              />
              <Route path="settings/payment-methods" element={<PaymentMethods />} />
              <Route path="settings/hours" element={<WorkingHours />} />
              <Route path="settings/audit" element={<AuditLog />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </RequireAuth>
    </AuthProvider>
  );
}
