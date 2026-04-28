import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { MitraGpsGuard } from "@/components/MitraGpsGuard";
import { MitraGpsSync } from "@/components/MitraGpsSync";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPenumpang from "@/pages/dashboard-penumpang";
import DashboardDriver from "@/pages/dashboard-driver";
import JadwalTetapBuat from "@/pages/jadwal-tetap-buat";
import CarterAtur from "@/pages/carter-atur";
import ProfilPage from "@/pages/profil";
import ProfilKendaraan from "@/pages/profil-kendaraan";
import ProfilKendaraanForm from "@/pages/profil-kendaraan-form";
import TebenganBuat from "@/pages/tebengan-buat";
import TebenganDetail from "@/pages/tebengan-detail";
import TebenganBook from "@/pages/tebengan-book";
import Cari from "@/pages/cari";
import JadwalBook from "@/pages/jadwal-book";
import BookingBayar from "@/pages/booking-bayar";
import BookingEtiket from "@/pages/booking-etiket";
import CarterCari from "@/pages/carter-cari";
import CarterBook from "@/pages/carter-book";
import CarterBayar from "@/pages/carter-bayar";
import CarterEtiket from "@/pages/carter-etiket";
import ChatList from "@/pages/chat-list";
import ChatThread from "@/pages/chat-thread";
import PesananPage from "@/pages/pesanan";
import JadwalMitraPage from "@/pages/jadwal-mitra";
import AdminLogin from "@/pages/admin/admin-login";
import AdminDashboard from "@/pages/admin/admin-dashboard";
import AdminUsers from "@/pages/admin/admin-users";
import AdminSchedules from "@/pages/admin/admin-schedules";
import AdminBookings from "@/pages/admin/admin-bookings";
import AdminCarter from "@/pages/admin/admin-carter";
import AdminPayments from "@/pages/admin/admin-payments";
import AdminKendaraan from "@/pages/admin/admin-kendaraan";
import AdminRatings from "@/pages/admin/admin-ratings";
import AdminLaporan from "@/pages/admin/admin-laporan";
import AdminKota from "@/pages/admin/admin-kota";
import AdminHarga from "@/pages/admin/admin-harga";
import AdminPengumuman from "@/pages/admin/admin-pengumuman";
import AdminLogs from "@/pages/admin/admin-logs";
import TripDetailPage from "@/pages/trip-detail";
import CarterDetailDriverPage from "@/pages/carter-detail-driver";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/daftar" component={RegisterPage} />
      <Route path="/dashboard-penumpang" component={DashboardPenumpang} />
      <Route path="/dashboard-driver" component={DashboardDriver} />
      <Route path="/jadwal-tetap/buat" component={JadwalTetapBuat} />
      <Route path="/carter/atur" component={CarterAtur} />
      <Route path="/profil" component={ProfilPage} />
      <Route path="/profil/kendaraan" component={ProfilKendaraan} />
      <Route path="/profil/kendaraan/baru" component={ProfilKendaraanForm} />
      <Route path="/profil/kendaraan/:id" component={ProfilKendaraanForm} />
      <Route path="/tebengan/buat" component={TebenganBuat} />
      <Route path="/tebengan/:id/book" component={TebenganBook} />
      <Route path="/tebengan/:id" component={TebenganDetail} />
      <Route path="/cari" component={Cari} />
      <Route path="/jadwal/:id/book" component={JadwalBook} />
      <Route path="/booking/:id/bayar" component={BookingBayar} />
      <Route path="/booking/:id/etiket" component={BookingEtiket} />
      <Route path="/carter/cari" component={CarterCari} />
      <Route path="/carter/:id/book" component={CarterBook} />
      <Route path="/carter-booking/:id/bayar" component={CarterBayar} />
      <Route path="/carter-booking/:id/etiket" component={CarterEtiket} />
      <Route path="/chat" component={ChatList} />
      <Route path="/chat/:id" component={ChatThread} />
      <Route path="/pesanan" component={PesananPage} />
      <Route path="/trip/:scheduleId/detail" component={TripDetailPage} />
      <Route path="/carter-booking/:id/driver-detail" component={CarterDetailDriverPage} />
      <Route path="/jadwal" component={JadwalMitraPage} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/schedules" component={AdminSchedules} />
      <Route path="/admin/bookings" component={AdminBookings} />
      <Route path="/admin/carter" component={AdminCarter} />
      <Route path="/admin/payments" component={AdminPayments} />
      <Route path="/admin/kendaraan" component={AdminKendaraan} />
      <Route path="/admin/ratings" component={AdminRatings} />
      <Route path="/admin/laporan" component={AdminLaporan} />
      <Route path="/admin/kota" component={AdminKota} />
      <Route path="/admin/harga" component={AdminHarga} />
      <Route path="/admin/pengumuman" component={AdminPengumuman} />
      <Route path="/admin/logs" component={AdminLogs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PushInit() {
  const { token } = useAuth();
  usePushNotifications(token);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <PushInit />
          <MitraGpsSync />
          <MitraGpsGuard>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </MitraGpsGuard>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
