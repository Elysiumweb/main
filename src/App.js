import "@/App.css";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GlobalSearch } from "@/components/GlobalSearch";
import { PushConsent } from "@/components/PushConsent";
import { registerSW } from "@/lib/pwa";
import Home from "@/pages/Home";
import Results from "@/pages/Results";
import Support from "@/pages/Support";
import Recruitment from "@/pages/Recruitment";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import Team from "@/pages/Team";
import PlayerDetail from "@/pages/PlayerDetail";
import Profile from "@/pages/Profile";
import LegalPage from "@/pages/LegalPage";
import Stats from "@/pages/Stats";
import Partners from "@/pages/Partners";
import Donate from "@/pages/Donate";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { NewsletterConfirm } from "@/components/NewsletterConfirm";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { CookieConsent } from "@/components/CookieConsent";
import { MfaChallenge } from "@/components/MfaChallenge";
import { SEOManager } from "@/components/SEOManager";
import PlayerLayout from "@/pages/player/PlayerLayout";
import ChatSpace from "@/pages/player/ChatSpace";
import Planning from "@/pages/player/Planning";
import Notes from "@/pages/player/Notes";
import CanvasSpace from "@/pages/player/CanvasSpace";
import ActivityLog from "@/pages/player/ActivityLog";
import News from "@/pages/News";
import ArticleDetail from "@/pages/ArticleDetail";
import MediaGallery from "@/pages/MediaGallery";
import CommunityCalendar from "@/pages/CommunityCalendar";
import Competitions from "@/pages/Competitions";
import About from "@/pages/About";
import Press from "@/pages/Press";
import NotFound from "@/pages/NotFound";

// Register service worker on load
registerSW();

const SkipLink = () => (
  <a href="#main-content" className="skip-link" data-testid="skip-link">
    Aller au contenu
  </a>
);

const PublicLayout = () => (
  <>
    <main id="main-content" tabIndex={-1} className="outline-none focus-visible:outline-none">
      <Outlet />
    </main>
    <Footer />
  </>
);

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <SEOManager />
            <SkipLink />
            <Navbar />
            <VerifyEmailBanner />
            <GlobalSearch />
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/resultats" element={<Results />} />
                <Route path="/equipe" element={<Team />} />
                <Route path="/equipe/:id" element={<PlayerDetail />} />
                <Route path="/actus" element={<News />} />
                <Route path="/actus/:id" element={<ArticleDetail />} />
                <Route path="/medias" element={<MediaGallery />} />
                <Route path="/calendrier" element={<CommunityCalendar />} />
                <Route path="/competitions" element={<Competitions />} />
                <Route path="/a-propos" element={<About />} />
                <Route path="/presse" element={<Press />} />
                <Route path="/support" element={<Support />} />
                <Route path="/recrutement" element={<Recruitment />} />
                <Route path="/statistiques" element={<Stats />} />
                <Route path="/partenaires" element={<Partners />} />
                <Route path="/soutenir" element={<Donate />} />
                <Route path="/dons" element={<Navigate to="/soutenir" replace />} />
                <Route path="/newsletter" element={<NewsletterSignup />} />
                <Route path="/newsletter/confirm/:token" element={<NewsletterConfirm />} />
                <Route path="/connexion" element={<Login />} />
                <Route path="/profil" element={<Profile />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/mentions-legales" element={<LegalPage kind="mentions" />} />
                <Route path="/confidentialite" element={<LegalPage kind="privacy" />} />
                <Route path="/cgu" element={<LegalPage kind="terms" />} />
              </Route>
              <Route path="/espace-joueur" element={<PlayerLayout />}>
                <Route index element={<Navigate to="chat" replace />} />
                <Route path="chat" element={<ChatSpace />} />
                <Route path="planning" element={<Planning />} />
                <Route path="notes" element={<Notes />} />
                <Route path="tableau" element={<CanvasSpace />} />
                <Route path="activite" element={<ActivityLog />} />
              </Route>
              <Route element={<PublicLayout />}>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
            <MfaChallenge />
            <PushConsent />
            <CookieConsent />
            <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#1A1A1A", border: "1px solid rgba(216,202,130,0.3)", color: "#f7f7f7", borderRadius: 0 } }} />
          </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
