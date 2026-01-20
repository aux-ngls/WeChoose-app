"use client";

import { useEffect, useState } from "react";
import { Folder, Plus, ArrowLeft, Star, Film, Clock, X } from "lucide-react"; // Ajout de X
import { API_URL } from "@/config";

interface Playlist {
  id: number;
  name: string;
  type: "custom" | "system";
}

interface Movie {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  
  // NOUVEAU : État pour le film sélectionné
  const [selectedMovie, setSelectedMovie] = useState<any>(null);

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = () => {
    fetch(`${API_URL}/playlists`)
      .then((res) => res.json())
      .then((data) => setPlaylists(data));
  };

  const openPlaylist = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    fetch(`${API_URL}/playlists/${playlist.id}`)
      .then((res) => res.json())
      .then((data) => setMovies(data));
  };

  const createPlaylist = async () => {
    if (!newPlaylistName) return;
    await fetch(`${API_URL}/playlists/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPlaylistName }),
    });
    setNewPlaylistName("");
    setShowCreate(false);
    fetchPlaylists();
  };

  // NOUVEAU : Fonction pour ouvrir les détails (copiée de la page d'accueil)
  const openDetails = async (id: number) => {
    const res = await fetch(`${API_URL}/movie/${id}`);
    const data = await res.json();
    setSelectedMovie(data);
  };

  // Icône selon le type de liste
  const getIcon = (p: Playlist) => {
    if (p.id === 1) return <Clock className="text-blue-500" />;
    if (p.id === -1) return <Star className="text-yellow-500" />;
    if (p.id === -2) return <Film className="text-gray-500" />;
    return <Folder className="text-white" />;
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-24">
      
      {/* VUE LISTE DES DOSSIERS */}
      {!selectedPlaylist ? (
        <>
          <h1 className="text-2xl font-bold mb-6 text-center">Mes Listes 📂</h1>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Bouton Créer */}
            <button 
                onClick={() => setShowCreate(!showCreate)} 
                className="bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-gray-700 transition"
            >
                <Plus className="w-8 h-8 text-gray-400" />
                <span className="text-xs font-bold text-gray-400">Nouvelle Liste</span>
            </button>

            {/* Liste des Playlists */}
            {playlists.map((p) => (
              <div 
                key={p.id} 
                onClick={() => openPlaylist(p)}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-gray-800 cursor-pointer transition"
              >
                {getIcon(p)}
                <span className="text-sm font-bold text-center truncate w-full">{p.name}</span>
              </div>
            ))}
          </div>

          {/* Formulaire création */}
          {showCreate && (
             <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                <div className="bg-gray-900 p-6 rounded-2xl w-full max-w-xs border border-gray-700">
                    <h3 className="font-bold mb-4">Nom de la playlist</h3>
                    <input 
                        className="w-full bg-black border border-gray-700 rounded p-2 mb-4 text-white"
                        autoFocus
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setShowCreate(false)} className="flex-1 py-2 bg-gray-700 rounded">Annuler</button>
                        <button onClick={createPlaylist} className="flex-1 py-2 bg-blue-600 rounded font-bold">Créer</button>
                    </div>
                </div>
             </div>
          )}
        </>
      ) : (
        /* VUE CONTENU D'UN DOSSIER */
        <>
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => setSelectedPlaylist(null)} className="p-2 bg-gray-800 rounded-full">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold truncate">{selectedPlaylist.name}</h1>
          </div>

          {movies.length === 0 ? (
            <p className="text-center text-gray-500 mt-20">Cette liste est vide.</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {movies.map((movie) => (
                <div 
                    key={movie.id} 
                    onClick={() => openDetails(movie.id)} // MODIFIÉ : Ajout du click
                    className="relative group cursor-pointer hover:scale-105 transition-transform" // MODIFIÉ : Effet hover
                >
                  <img src={movie.poster_url} className="rounded-lg w-full aspect-[2/3] object-cover" />
                  <p className="mt-1 text-[10px] text-gray-400 truncate">{movie.title}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODAL DETAIL (Comme dans le "Tinder") */}
      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gray-900 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-800 relative">
            <button onClick={() => setSelectedMovie(null)} className="absolute top-3 right-3 z-10 bg-black/60 p-1.5 rounded-full hover:bg-red-600 transition">
                <X className="w-5 h-5"/>
            </button>
            
            <div className="aspect-video bg-black">
                {selectedMovie.trailer_url ? (
                    <iframe src={selectedMovie.trailer_url} className="w-full h-full" allowFullScreen/>
                ) : (
                    <img src={selectedMovie.poster_url} className="w-full h-full object-cover opacity-60"/>
                )}
            </div>

            <div className="p-5">
                <h2 className="text-xl font-bold mb-1">{selectedMovie.title}</h2>
                <div className="flex gap-2 text-xs text-gray-400 mb-4">
                    <span>{selectedMovie.release_date}</span>
                    <span className="text-yellow-400 flex items-center"><Star className="w-3 h-3 mr-1 fill-current"/>{selectedMovie.rating}</span>
                </div>
                
                <p className="text-gray-300 text-sm mb-4">{selectedMovie.overview}</p>
                
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {selectedMovie.cast?.map((a:any, i:number) => (
                        <div key={i} className="w-16 flex-shrink-0 text-center">
                            <img src={a.photo||""} className="w-12 h-12 rounded-full object-cover mx-auto mb-1 bg-gray-800"/>
                            <p className="text-[10px] truncate">{a.name}</p>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}