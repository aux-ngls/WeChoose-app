"use client";

import { useState } from "react";
import { Search, X, Heart, ListPlus, Star, Clock, Check } from "lucide-react";
import { API_URL } from "@/config";

interface MovieDetail {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview?: string;
  trailer_url?: string;
  cast?: { name: string; character: string; photo: string | null }[];
  release_date?: string;
}

interface Playlist {
  id: number;
  name: string;
  type: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieDetail[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // --- NOUVEAU : Gestion des Playlists ---
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [myPlaylists, setMyPlaylists] = useState<Playlist[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    const res = await fetch(`${API_URL}/search?query=${query}`);
    const data = await res.json();
    setResults(data);
    setLoading(false);
  };

  const openDetails = async (id: number) => {
    const res = await fetch(`${API_URL}/movie/${id}`);
    const data = await res.json();
    setSelectedMovie(data);
    // On remet le sélecteur à zéro quand on ouvre un nouveau film
    setShowPlaylistSelector(false);
  };

  // 1. Récupérer les playlists dispos
  const fetchPlaylists = async () => {
    const res = await fetch(`${API_URL}/playlists`);
    const data = await res.json();
    setMyPlaylists(data.filter((p: Playlist) => p.type !== "system"));
  };

  // 2. Ouvrir le menu de choix
  const openPlaylistSelector = () => {
    fetchPlaylists();
    setShowPlaylistSelector(true);
  };

  // 3. Ajouter à une liste spécifique
  const addToSpecificPlaylist = (playlistId: number) => {
    if (selectedMovie) {
      fetch(`${API_URL}/playlists/${playlistId}/add/${selectedMovie.id}`, { method: "POST" });
      alert("Film ajouté à la playlist ! ✅");
      setShowPlaylistSelector(false);
    }
  };

  // Optionnel : Bouton "J'ai déjà vu et j'aime" (Note 5/5 rapide)
  const rateAsLiked = () => {
    if (selectedMovie) {
        fetch(`${API_URL}/movies/rate/${selectedMovie.id}/5`, { method: "POST" });
        alert("Marqué comme vu et liké (5★) ! ⭐");
    }
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-24">
      {/* Barre de Recherche */}
      <div className="sticky top-0 bg-black/95 z-10 py-2 mb-2">
        <form onSubmit={handleSearch} className="relative max-w-lg mx-auto">
          <input
            type="text"
            placeholder="Rechercher un film..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg py-3 px-10 text-white text-sm focus:outline-none focus:border-red-600 transition-colors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
        </form>
      </div>

      {/* Grille de Résultats */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
        {results.map((movie) => (
          <div key={movie.id} onClick={() => openDetails(movie.id)} className="cursor-pointer group relative">
            <div className="rounded-lg overflow-hidden aspect-[2/3] border border-gray-800">
              {/* Correction Image Vide incluse ici */}
              <img 
                src={movie.poster_url || "https://via.placeholder.com/500x750?text=No+Image"} 
                alt={movie.title} 
                className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300" 
              />
            </div>
            <h3 className="mt-1 text-[10px] md:text-xs font-bold truncate text-gray-300 group-hover:text-white">{movie.title}</h3>
          </div>
        ))}
      </div>

      {/* MODAL DÉTAILS */}
      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl border border-gray-800 relative">
            
            {/* VUE NORMALE : DÉTAILS DU FILM */}
            {!showPlaylistSelector ? (
                <>
                    <button onClick={() => setSelectedMovie(null)} className="absolute top-3 right-3 z-10 bg-black/60 p-1.5 rounded-full hover:bg-red-600 transition">
                    <X className="w-5 h-5 text-white" />
                    </button>

                    <div className="w-full aspect-video bg-black">
                    {selectedMovie.trailer_url ? (
                        <iframe src={selectedMovie.trailer_url} className="w-full h-full" allowFullScreen title="Trailer" />
                    ) : (
                        <img src={selectedMovie.poster_url || "https://via.placeholder.com/500"} className="w-full h-full object-cover opacity-60" />
                    )}
                    </div>

                    <div className="p-5">
                    <h2 className="text-xl font-bold mb-1">{selectedMovie.title}</h2>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                        <span>{selectedMovie.release_date}</span>
                        <span className="flex items-center text-yellow-400"><Star className="w-3 h-3 mr-1 fill-current" /> {selectedMovie.rating.toFixed(1)}</span>
                    </div>

                    {/* BOUTONS D'ACTION */}
                    <div className="flex gap-2 mb-4">
                        {/* Bouton Playlist */}
                        <button onClick={openPlaylistSelector} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-500 transition">
                        <ListPlus className="w-4 h-4" /> Playlist
                        </button>
                        
                        {/* Bouton Déjà Vu / Like Rapide */}
                        <button onClick={rateAsLiked} className="flex-1 bg-gray-800 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 border border-gray-700 hover:bg-green-600 transition">
                        <Heart className="w-4 h-4" /> J'adore
                        </button>
                    </div>

                    <p className="text-gray-300 text-sm leading-relaxed mb-6">{selectedMovie.overview}</p>

                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {selectedMovie.cast?.map((actor, i) => (
                        <div key={i} className="flex-shrink-0 w-16 text-center">
                            <img src={actor.photo || "https://via.placeholder.com/100"} className="w-12 h-12 rounded-full object-cover mx-auto mb-1 border border-gray-700" />
                            <p className="text-[10px] font-medium truncate">{actor.name}</p>
                        </div>
                        ))}
                    </div>
                    </div>
                </>
            ) : (
                // VUE SÉLECTEUR DE PLAYLIST
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <button onClick={() => setShowPlaylistSelector(false)} className="p-1 hover:bg-gray-800 rounded"><X className="w-5 h-5"/></button>
                        <h3 className="font-bold text-lg">Ajouter à...</h3>
                    </div>
                    <div className="space-y-2">
                        {myPlaylists.length === 0 && <p className="text-gray-500 text-center text-sm">Aucune playlist créée.</p>}
                        
                        {myPlaylists.map(p => (
                            <button key={p.id} onClick={() => addToSpecificPlaylist(p.id)} className="w-full p-4 bg-gray-800 rounded-xl flex justify-between items-center hover:bg-gray-700 transition">
                                <span className="font-medium">{p.name}</span>
                                {p.id === 1 ? <Clock className="w-4 h-4 text-blue-400"/> : <ListPlus className="w-4 h-4 text-gray-500"/>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}