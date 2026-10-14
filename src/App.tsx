import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import Bag from "./pages/Bag";
import Recommendations from "./pages/Recommendations";
import Pokedex from "./pages/Pokedex";
import Raids from "./pages/Raids";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="pokedex" element={<Pokedex />} />
            <Route path="raids" element={<Raids />} />
            <Route
              path="bag"
              element={
                <RequireAuth>
                  <Bag />
                </RequireAuth>
              }
            />
            <Route
              path="recommendations"
              element={
                <RequireAuth>
                  <Recommendations />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
