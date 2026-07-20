import "@/App.css";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Home from "@/pages/Home";
import Results from "@/pages/Results";
import Support from "@/pages/Support";
import Recruitment from "@/pages/Recruitment";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import PlayerLayout from "@/pages/player/PlayerLayout";
import ChatSpace from "@/pages/player/ChatSpace";
import Planning from "@/pages/player/Planning";
import Notes from "@/pages/player/Notes";
import CanvasSpace from "@/pages/player/CanvasSpace";

const PublicLayout = () => (
  <>
    <Outlet />
    <Footer />
  </>
);

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/resultats" element={<Results />} />
              <Route path="/support" element={<Support />} />
              <Route path="/recrutement" element={<Recruitment />} />
              <Route path="/connexion" element={<Login />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="/espace-joueur" element={<PlayerLayout />}>
              <Route index element={<Navigate to="chat" replace />} />
              <Route path="chat" element={<ChatSpace />} />
              <Route path="planning" element={<Planning />} />
              <Route path="notes" element={<Notes />} />
              <Route path="tableau" element={<CanvasSpace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#1A1A1A", border: "1px solid rgba(216,202,130,0.3)", color: "#f7f7f7", borderRadius: 0 } }} />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
