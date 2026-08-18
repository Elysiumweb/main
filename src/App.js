import "@/App.css";
import { lazy } from "react";
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GlobalSearch } from "@/components/GlobalSearch";
import { PushConsent } from "@/components/PushConsent";
import { registerSW } from "@/lib/pwa";
import { RouteChunkBoundary } from "@/components/RouteChunkBoundary";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { CookieConsent } from "@/components/CookieConsent";
import { MfaChallenge } from "@/components/MfaChallenge";
import { SEOManager } from "@/components/SEOManager";
import { UpdatePrompt } from "@/components/UpdatePrompt";
// La page d'accueil reste en import statique : c'est la cible la plus
// fréquente, lui imposer un aller-retour réseau supplémentaire dégraderait
// le LCP. Toutes les autres routes sont chargées à la demande.
import Home from "@/pages/Home";

const Results = lazy(() => import("@/pages/Results"));
const Support = lazy(() => import("@/pages/Support"));
const Recruitment = lazy(() => import("@/pages/Recruitment"));
const Login = lazy(() => import("@/pages/Login"));
const Admin = lazy(() => import("@/pages/Admin"));
const Team = lazy(() => import("@/pages/Team"));
const PlayerDetail = lazy(() => import("@/pages/PlayerDetail"));
const Profile = lazy(() => import("@/pages/Profile"));
const LegalPage = lazy(() => import("@/pages/LegalPage"));
const Stats = lazy(() => import("@/pages/Stats"));
const Partners = lazy(() => import("@/pages/Partners"));
const Donate = lazy(() => import("@/pages/Donate"));
const News = lazy(() => import("@/pages/News"));
const ArticleDetail = lazy(() => import("@/pages/ArticleDetail"));
const MediaGallery = lazy(() => import("@/pages/MediaGallery"));
const CommunityCalendar = lazy(() => import("@/pages/CommunityCalendar"));
const Competitions = lazy(() => import("@/pages/Competitions"));
const CompetitionDetail = lazy(() => import("@/pages/CompetitionDetail"));
const MatchDetail = lazy(() => import("@/pages/MatchDetail"));
const About = lazy(() => import("@/pages/About"));
const Press = lazy(() => import("@/pages/Press"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Offline = lazy(() => import("@/pages/Offline"));

// Composants exportés nommément : React.lazy attend un export default.
const NewsletterSignup = lazy(() =>
  import("@/components/NewsletterSignup").then((m) => ({ default: m.NewsletterSignup }))
);
const NewsletterConfirm = lazy(() =>
  import("@/components/NewsletterConfirm").then((m) => ({ default: m.NewsletterConfirm }))
);

// L'espace joueur est privé : son layout et ses onglets forment un groupe
// de chunks que les visiteurs publics ne téléchargent jamais.
const PlayerLayout = lazy(() => import("@/pages/player/PlayerLayout"));
const ChatSpace = lazy(() => import("@/pages/player/ChatSpace"));
const Planning = lazy(() => import("@/pages/player/Planning"));
const Notes = lazy(() => import("@/pages/player/Notes"));
const CanvasSpace = lazy(() => import("@/pages/player/CanvasSpace"));
const ActivityLog = lazy(() => import("@/pages/player/ActivityLog"));

// Register service worker on load
registerSW();

const SkipLink = () => (
  <a href="#main-content" className="skip-link" data-testid="skip-link">
    Aller au contenu
  </a>
);

const PublicLayout = () => {
  const { pathname } = useLocation();
  return (
    <>
      <main id="main-content" tabIndex={-1} className="outline-none focus-visible:outline-none">
        <RouteChunkBoundary routeKey={pathname}>
          <Outlet />
        </RouteChunkBoundary>
      </main>
      <Footer />
    </>
  );
};

const LazyPlayerLayout = () => {
  const { pathname } = useLocation();
  return (
    <RouteChunkBoundary routeKey={pathname}>
      <PlayerLayout />
    </RouteChunkBoundary>
  );
};

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
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
              <Route path="/resultats/:id" element={<MatchDetail />} />
              <Route path="/match/:id" element={<MatchDetail />} />
              <Route path="/equipe" element={<Team />} />
              <Route path="/equipe/:id" element={<PlayerDetail />} />
              <Route path="/actus" element={<News />} />
              <Route path="/actus/:id" element={<ArticleDetail />} />
              <Route path="/medias" element={<MediaGallery />} />
              <Route path="/calendrier" element={<CommunityCalendar />} />
              <Route path="/competitions" element={<Competitions />} />
              <Route path="/competitions/:id" element={<CompetitionDetail />} />
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
              <Route path="/offline" element={<Offline />} />
            </Route>
            <Route path="/espace-joueur" element={<LazyPlayerLayout />}>
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
          <UpdatePrompt />
          <MfaChallenge />
          <PushConsent />
          <CookieConsent />
          <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#1A1A1A", border: "1px solid rgba(216,202,130,0.3)", color: "#f7f7f7", borderRadius: 0 } }} />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
