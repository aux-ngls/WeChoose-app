"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/config";
import { UserPlus, Loader2 } from "lucide-react";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || "Erreur d'inscription");

      // Sauvegarde du token
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("username", username);
      
      router.push("/"); // Redirection vers l'accueil
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-xl">
        <div className="flex justify-center mb-6">
            <div className="p-3 bg-red-600 rounded-full"><UserPlus className="w-8 h-8"/></div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-6">Créer un compte</h1>
        
        {error && <div className="bg-red-500/20 text-red-500 p-3 rounded-lg mb-4 text-sm text-center">{error}</div>}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nom d'utilisateur</label>
            <input 
                type="text" 
                required 
                className="w-full bg-black border border-gray-700 rounded-lg p-3 focus:border-red-600 outline-none transition"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mot de passe</label>
            <input 
                type="password" 
                required 
                className="w-full bg-black border border-gray-700 rounded-lg p-3 focus:border-red-600 outline-none transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 py-3 rounded-lg font-bold transition flex justify-center"
          >
            {loading ? <Loader2 className="animate-spin"/> : "S'inscrire"}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          Déjà un compte ? <Link href="/login" className="text-white hover:underline">Se connecter</Link>
        </p>
      </div>
    </main>
  );
}