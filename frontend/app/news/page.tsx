"use client";

import { useState, useEffect } from "react";
import { Star, X, ListPlus, Clock } from "lucide-react";
import { API_URL } from "@/config";

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview?: string;
}

interface MovieDetail extends Movie {
  trailer_url?: string;
  cast?: { name: string; photo: string | null }[];
  release_date?: string;
}

interface Playlist {
  id: number;
  name: string;
  type: string;
}

export default function NewsPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<MovieDetail | null>(null);

  // Gestion des Playlists
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [myPlaylists, setMyPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const res = await fetch(`${API_URL}/movies/news`);
      const data = await res.json();
      setMovies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Ouvrir les détails complets (appel API pour avoir le trailer)
  const openDetails = async (id: number) => {
    const res = await fetch(`${API_URL}/movie/${id}`);
    const data = await res.json();
    setSelectedMovie(data);
    setShowPlaylistSelector(false); // Reset du sélecteur
  };

  // Récupérer les playlists pour le bouton "Ajouter"
  const openPlaylistSelector = async () => {
    const res = await fetch(`${API_URL}/playlists`);
    const data = await res.json();
    setMyPlaylists(data.filter((p: Playlist) => p.type !== "system"));
    setShowPlaylistSelector(true);
  };

  const addToPlaylist = (playlistId: number) => {
    if (selectedMovie) {
      fetch(`${API_URL}/playlists/${playlistId}/add/${selectedMovie.id}`, { method: "POST" });
      setShowPlaylistSelector(false);
      alert("Film ajouté ! 🍿");
    }
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-24">
      <h1 className="text-2xl font-bold mb-6 text-red-600 tracking-tighter">À l'affiche 🎬</h1>

      {loading ? (
        <p className="text-gray-500 text-center mt-10">Chargement des sorties...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {movies.map((movie) => (
            <div 
              key={movie.id} 
              onClick={() => openDetails(movie.id)}
              className="group cursor-pointer"
            >
              <div className="relative rounded-xl overflow-hidden aspect-[2/3] border border-gray-800 mb-2">
                <img 
                  src={movie.poster_url} 
                  alt={movie.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute top-2 right-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-bold text-yellow-400 flex items-center backdrop-blur-sm">
                  <Star className="w-3 h-3 mr-1 fill-current"/> {movie.rating.toFixed(1)}
                </div>
              </div>
              <h3 className="font-bold text-sm leading-tight text-gray-200 group-hover:text-white transition-colors">{movie.title}</h3>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DÉTAILS (Code identique aux autres pages) */}
      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gray-900 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-800 relative shadow-2xl">
            
            {!showPlaylistSelector ? (
                <>
                    <button onClick={() => setSelectedMovie(null)} className="absolute top-3 right-3 z-10 bg-black/60 p-1.5 rounded-full hover:bg-red-600 transition">
                        <X className="w-5 h-5"/>
                    </button>
                    
                    <div className="aspect-video bg-black w-full">
                        {selectedMovie.trailer_url ? (
                            <iframe src={selectedMovie.trailer_url} className="w-full h-full" allowFullScreen/>
                        ) : (
                            <img src={selectedMovie.poster_url} className="w-full h-full object-cover opacity-60"/>
                        )}
                    </div>

                    <div className="p-6">
                        <h2 className="text-2xl font-bold mb-2">{selectedMovie.title}</h2>
                        <div className="flex gap-3 text-xs text-gray-400 mb-6">
                            <span>{selectedMovie.release_date}</span>
                            <span className="text-yellow-400 flex items-center"><Star className="w-3 h-3 mr-1 fill-current"/>{selectedMovie.rating}</span>
                        </div>

                        <button onClick={openPlaylistSelector} className="w-full bg-blue-600 py-3 rounded-xl font-bold flex justify-center gap-2 mb-6 hover:bg-blue-500 transition">
                            <ListPlus className="w-5 h-5"/> Ajouter à une liste
                        </button>
                        
                        <p className="text-gray-300 text-sm leading-relaxed mb-6">{selectedMovie.overview}</p>
                        
                        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                            {selectedMovie.cast?.map((a, i) => (
                                <div key={i} className="w-16 flex-shrink-0 text-center">
                                    <img src={a.photo || ""} className="w-14 h-14 rounded-full object-cover mx-auto mb-2 border border-gray-700"/>
                                    <p className="text-[10px] text-gray-400 truncate">{a.name}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <button onClick={() => setShowPlaylistSelector(false)}><X/></button>
                        <h3 className="font-bold text-lg">Choisir une playlist</h3>
                    </div>
                    <div className="space-y-2">
                        {myPlaylists.map(p => (
                            <button key={p.id} onClick={() => addToPlaylist(p.id)} className="w-full p-4 bg-gray-800 rounded-xl flex justify-between hover:bg-gray-700 transition">
                                <span className="font-medium">{p.name}</span>
                                {p.id === 1 && <Clock className="w-4 h-4 text-blue-400"/>}
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