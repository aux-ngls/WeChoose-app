"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/config";
import { persistStoredSession } from "@/lib/auth";
import { LogIn, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedPassword) {
      setError("Merci de remplir tous les champs.");
      setLoading(false);
      return;
    }

    // FastAPI attend un format "Form Data" pour le login OAuth2 standard
    const formData = new URLSearchParams();
    formData.append("username", normalizedUsername);
    formData.append("password", normalizedPassword);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error("Identifiants incorrects");

      persistStoredSession(
        data.access_token,
        normalizedUsername,
        Boolean(data.has_completed_onboarding),
        Boolean(data.has_completed_tutorial),
      );

      router.push(data.has_completed_onboarding ? "/" : "/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Impossible de se connecter");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-xl">
        <div className="flex justify-center mb-6">
            <div className="p-3 bg-blue-600 rounded-full"><LogIn className="w-8 h-8"/></div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-6">Connexion</h1>
        
        {error && <div className="bg-red-500/20 text-red-500 p-3 rounded-lg mb-4 text-sm text-center">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nom d&apos;utilisateur</label>
            <input 
                type="text" 
                required 
                className="w-full bg-black border border-gray-700 rounded-lg p-3 focus:border-blue-600 outline-none transition"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mot de passe</label>
            <input 
                type="password" 
                required 
                className="w-full bg-black border border-gray-700 rounded-lg p-3 focus:border-blue-600 outline-none transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-bold transition flex justify-center"
          >
            {loading ? <Loader2 className="animate-spin"/> : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          Pas encore de compte ? <Link href="/signup" className="text-white hover:underline">Créer un compte</Link>
        </p>
      </div>
    </main>
  );
}
